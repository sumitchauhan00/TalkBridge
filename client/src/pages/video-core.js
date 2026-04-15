(() => {
  const baseURL = window.location.origin;
  const socket = io(baseURL);

  const user = JSON.parse(localStorage.getItem("user"));
  if (!user) {
    alert("Login first");
    window.location = "Login.html";
    return;
  }

  const myId = user._id;
  let realFriend = localStorage.getItem("callTo");

  const myLabel = document.getElementById("myLabel");
  const friendLabel = document.getElementById("friendLabel");
  const myVideo = document.getElementById("myVideo");
  const userVideo = document.getElementById("userVideo");

  if (myLabel) myLabel.innerText = user.username || "You";
  socket.emit("join", myId);

  if (myVideo) {
    myVideo.autoplay = true;
    myVideo.playsInline = true;
    myVideo.muted = true;
  }
  if (userVideo) {
    userVideo.autoplay = true;
    userVideo.playsInline = true;
  }

  let localStream;
  let peer;
  let remoteStream;
  let keepAliveInterval = null;

  // Offer/answer negotiation state
  let makingOffer = false;
  let ignoreOffer = false;
  let isSettingRemoteAnswerPending = false;
  const isCaller = localStorage.getItem("isCaller") === "true";
  const polite = !isCaller;

  function showAlert(msg) {
    const toast = document.getElementById("toast");
    if (!toast) return;
    toast.innerText = msg;
    toast.classList.add("show");
    setTimeout(() => toast.classList.remove("show"), 2000);
  }

  function goBackAfterCall() {
    const pre = localStorage.getItem("preCallPage");
    if (pre) {
      localStorage.removeItem("preCallPage");
      window.location = pre;
    } else {
      window.location = "Chat.html"; // if your file is chat.html then change
    }
  }

  async function loadFriendName() {
    if (!realFriend || !friendLabel) return;
    try {
      const res = await fetch(`${baseURL}/api/auth/user/${realFriend}`);
      const data = await res.json();
      friendLabel.innerText = data.username || "Unknown";
    } catch {
      friendLabel.innerText = "Unknown";
    }
  }
  loadFriendName();

  function ensureLocalTracksAdded() {
    if (!peer || !localStream) return;
    const senders = peer.getSenders();

    localStream.getTracks().forEach((track) => {
      const existing = senders.find((s) => s.track && s.track.kind === track.kind);
      if (!existing) peer.addTrack(track, localStream);
      else if (existing.track !== track) existing.replaceTrack(track);
    });
  }

  async function getAndAddLocalStream() {
    try {
      if (localStream) return; // prevent duplicate gUM
      localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      if (myVideo) {
        myVideo.srcObject = localStream;
        myVideo.play?.().catch(() => {});
      }
      ensureLocalTracksAdded();
    } catch (e) {
      showAlert("Camera/Mic access denied or not available");
      console.warn("getUserMedia error:", e);
    }
  }

  function createPeer() {
    if (peer) return;

    peer = new RTCPeerConnection({
      iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
    });

    peer.ontrack = (event) => {
      const [stream] = event.streams;
      if (stream && userVideo) {
        remoteStream = stream;
        userVideo.srcObject = stream;
        userVideo.play?.().catch(() => {});
      }
    };

    peer.onicecandidate = ({ candidate }) => {
      if (candidate && realFriend) {
        socket.emit("ice-candidate", { to: realFriend, from: myId, candidate });
      }
    };

    peer.onconnectionstatechange = () => {
      if (
        (peer.connectionState === "connected" || peer.connectionState === "completed") &&
        remoteStream &&
        userVideo
      ) {
        if (userVideo.srcObject !== remoteStream) userVideo.srcObject = remoteStream;
        userVideo.play?.().catch(() => {});
      }
    };

    peer.onnegotiationneeded = async () => {
      try {
        if (!realFriend) return;
        makingOffer = true;
        await peer.setLocalDescription(await peer.createOffer());
        socket.emit("webrtc-description", {
          to: realFriend,
          from: myId,
          description: peer.localDescription,
        });
      } catch (e) {
        console.log("onnegotiationneeded error:", e);
      } finally {
        makingOffer = false;
      }
    };

    ensureLocalTracksAdded();
  }

  socket.on("call-made", async ({ from }) => {
    realFriend = from;
    loadFriendName();

    await getAndAddLocalStream();
    if (!peer) createPeer();
  });

  socket.on("webrtc-description", async ({ from, description }) => {
    try {
      realFriend = from;
      if (!peer) {
        await getAndAddLocalStream();
        createPeer();
      }

      const readyForOffer =
        !makingOffer && (peer.signalingState === "stable" || isSettingRemoteAnswerPending);

      const offerCollision = description.type === "offer" && !readyForOffer;
      ignoreOffer = !polite && offerCollision;
      if (ignoreOffer) return;

      isSettingRemoteAnswerPending = description.type === "answer";
      await peer.setRemoteDescription(description);
      isSettingRemoteAnswerPending = false;

      if (description.type === "offer") {
        ensureLocalTracksAdded();
        await peer.setLocalDescription(await peer.createAnswer());
        socket.emit("webrtc-description", {
          to: realFriend,
          from: myId,
          description: peer.localDescription,
        });
      }
    } catch (e) {
      console.error("webrtc-description error:", e);
    }
  });

  socket.on("ice-candidate", async ({ candidate }) => {
    try {
      if (!peer || !candidate) return;
      await peer.addIceCandidate(candidate);
    } catch (e) {
      if (!ignoreOffer) console.error("ICE add error:", e);
    }
  });

  socket.on("call-declined", () => {
    showAlert("Call Declined");
    setTimeout(cleanupAndExit, 700);
  });

  socket.on("call-ended", () => {
    showAlert("Call Ended");
    setTimeout(cleanupAndExit, 700);
  });

  async function start() {
    if (!realFriend) realFriend = localStorage.getItem("callTo");

    await getAndAddLocalStream();
    createPeer();

    window.AppSpeechToSign?.init?.();
    window.AppSignToSpeech?.init?.();

    // caller must send offer immediately
    if (isCaller && realFriend && peer) {
      try {
        makingOffer = true;
        await peer.setLocalDescription(await peer.createOffer());

        socket.emit("webrtc-description", {
          to: realFriend,
          from: myId,
          description: peer.localDescription,
        });

        // legacy wake-up event support
        socket.emit("call-user", {
          to: realFriend,
          from: myId,
          offer: peer.localDescription,
        });
      } catch (e) {
        console.error("initial offer error:", e);
      } finally {
        makingOffer = false;
      }
    }
  }

  keepAliveInterval = setInterval(() => {
    if (remoteStream && userVideo && userVideo.srcObject !== remoteStream) {
      userVideo.srcObject = remoteStream;
      userVideo.play?.().catch(() => {});
    }
  }, 700);

  function cleanupAndExit() {
    if (keepAliveInterval) {
      clearInterval(keepAliveInterval);
      keepAliveInterval = null;
    }

    if (localStream) localStream.getTracks().forEach((track) => track.stop());

    if (peer) {
      peer.onnegotiationneeded = null;
      peer.onicecandidate = null;
      peer.ontrack = null;
      peer.close();
      peer = null;
    }

    window.AppSpeechToSign?.cleanup?.();
    window.AppSignToSpeech?.cleanup?.();

    localStorage.removeItem("isCaller");
    localStorage.removeItem("callTo");

    goBackAfterCall();
  }

  function hangUp() {
    if (realFriend) {
      socket.emit("end-call", { to: realFriend, from: myId });
      socket.emit("call-ended", { to: realFriend, from: myId }); // compat
    }
    cleanupAndExit();
  }

  function declineCall() {
    if (realFriend) socket.emit("call-declined", { to: realFriend, from: myId });
    cleanupAndExit();
  }

  function toggleMute() {
    if (!localStream) return;
    const tracks = localStream.getAudioTracks();
    if (!tracks.length) return;

    const enabled = tracks[0].enabled;
    tracks.forEach((t) => (t.enabled = !enabled));
    showAlert(enabled ? "Mic Off" : "Mic On");
  }

  function toggleVideo() {
    const activeStream = myVideo && myVideo.srcObject ? myVideo.srcObject : localStream;
    if (!activeStream) {
      showAlert("No camera stream");
      return;
    }

    const tracks = activeStream.getVideoTracks();
    if (!tracks.length) {
      showAlert("No video track");
      return;
    }

    const willEnable = !tracks[0].enabled;
    tracks.forEach((t) => (t.enabled = willEnable));

    if (localStream && localStream !== activeStream) {
      localStream.getVideoTracks().forEach((t) => (t.enabled = willEnable));
    }

    if (myVideo) {
      myVideo.srcObject = activeStream;
      myVideo.play?.().catch(() => {});
      myVideo.style.opacity = willEnable ? "1" : "0.15";
    }

    showAlert(willEnable ? "Camera On" : "Camera Off");

    window.dispatchEvent(
      new CustomEvent("app:video-toggled", { detail: { enabled: willEnable } })
    );
  }

  window.hangUp = hangUp;
  window.declineCall = declineCall;
  window.toggleMute = toggleMute;
  window.toggleVideo = toggleVideo;

  window.VideoApp = {
    socket,
    myId,
    get realFriend() {
      return realFriend;
    },
    set realFriend(v) {
      realFriend = v;
    },
    get myVideo() {
      return myVideo;
    },
    showAlert,
  };

  start();
})();