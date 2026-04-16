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

  let localStream = null;
  let peer = null;
  let remoteStream = null;
  let keepAliveInterval = null;

  let makingOffer = false;
  let sentInitialOffer = false;
  let remoteDescSet = false;
  const pendingCandidates = [];

  const isCaller = localStorage.getItem("isCaller") === "true";

  // sender auto-refresh once when receiver local camera is ready
  let senderAutoRefreshed = sessionStorage.getItem("senderAutoRefreshed") === "1";

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
      window.location = "Chat.html";
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

  function ensureLocalTracksAdded() {
    if (!peer || !localStream) return;
    const senders = peer.getSenders();

    localStream.getTracks().forEach((track) => {
      const existing = senders.find((s) => s.track && s.track.kind === track.kind);
      if (!existing) peer.addTrack(track, localStream);
      else if (existing.track !== track) existing.replaceTrack(track);
    });
  }

  async function getLocalStreamOnce() {
    if (localStream) return localStream;

    localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });

    if (myVideo) {
      myVideo.srcObject = localStream;
      myVideo.play?.().catch(() => {});
      myVideo.style.opacity = "1";
    }

    // receiver local preview ready -> ask sender to refresh once
    if (!isCaller && realFriend) {
      socket.emit("receiver-local-ready", { to: realFriend, from: myId });
    }

    return localStream;
  }

  async function flushPendingIce() {
    while (pendingCandidates.length) {
      const c = pendingCandidates.shift();
      try {
        await peer.addIceCandidate(new RTCIceCandidate(c));
      } catch (e) {
        console.error("pending ICE error:", e);
      }
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
      if (!candidate || !realFriend) return;
      socket.emit("ice-candidate", { to: realFriend, from: myId, candidate });
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

    ensureLocalTracksAdded();
  }

  async function initPeerWithLocalMedia() {
    await getLocalStreamOnce();
    createPeer();
    ensureLocalTracksAdded();
  }

  async function sendInitialOfferOnce() {
    if (!isCaller || !realFriend || !peer || sentInitialOffer || makingOffer) return;

    try {
      makingOffer = true;
      await peer.setLocalDescription(await peer.createOffer());

      socket.emit("webrtc-description", {
        to: realFriend,
        from: myId,
        description: peer.localDescription,
      });

      socket.emit("call-user", {
        to: realFriend,
        from: myId,
        offer: peer.localDescription,
      });

      sentInitialOffer = true;
    } catch (e) {
      console.error("initial offer error:", e);
    } finally {
      makingOffer = false;
    }
  }

  socket.on("call-made", async ({ from }) => {
    try {
      realFriend = from;
      await loadFriendName();
      await initPeerWithLocalMedia();

      socket.emit("callee-ready", { to: realFriend, from: myId });
    } catch (e) {
      console.error("call-made error:", e);
    }
  });

  socket.on("callee-ready", async ({ from }) => {
    if (!isCaller) return;
    if (from !== realFriend) return;
    await initPeerWithLocalMedia();
    await sendInitialOfferOnce();
  });

  // sender refreshes once when receiver local camera is ready
  socket.on("receiver-local-ready", ({ from }) => {
    if (!isCaller) return;
    if (from !== realFriend) return;
    if (senderAutoRefreshed) return;

    senderAutoRefreshed = true;
    sessionStorage.setItem("senderAutoRefreshed", "1");
    window.location.reload();
  });

  socket.on("webrtc-description", async ({ from, description }) => {
    try {
      realFriend = from;
      await initPeerWithLocalMedia();

      if (description.type === "offer") {
        if (peer.signalingState !== "stable") {
          await Promise.all([
            peer.setLocalDescription({ type: "rollback" }).catch(() => {}),
            peer.setRemoteDescription(description),
          ]);
        } else {
          await peer.setRemoteDescription(description);
        }

        remoteDescSet = true;
        await flushPendingIce();

        await peer.setLocalDescription(await peer.createAnswer());
        socket.emit("webrtc-description", {
          to: realFriend,
          from: myId,
          description: peer.localDescription,
        });
        return;
      }

      if (description.type === "answer") {
        if (peer.signalingState === "have-local-offer") {
          await peer.setRemoteDescription(description);
          remoteDescSet = true;
          await flushPendingIce();
        }
      }
    } catch (e) {
      console.error("webrtc-description error:", e);
    }
  });

  socket.on("ice-candidate", async ({ candidate }) => {
    try {
      if (!peer || !candidate) return;

      if (!remoteDescSet) {
        pendingCandidates.push(candidate);
        return;
      }

      await peer.addIceCandidate(new RTCIceCandidate(candidate));
    } catch (e) {
      console.error("ICE add error:", e);
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

  // NEW: keep both sides in sync for camera toggle
 socket.on("remote-video-toggled", ({ enabled }) => {
  if (!userVideo) return;

  if (enabled) {
    userVideo.style.opacity = "1";
    userVideo.style.backgroundColor = "#000";
  } else {
    userVideo.style.opacity = "0";          // hide video frame
    userVideo.style.backgroundColor = "#000"; // show black box
  }

  showAlert(enabled ? "Friend's Camera On" : "Friend's Camera Off");
});

  async function start() {
    if (!realFriend) realFriend = localStorage.getItem("callTo");
    await loadFriendName();
    await initPeerWithLocalMedia();

    window.AppSpeechToSign?.init?.();
    window.AppSignToSpeech?.init?.();

    if (isCaller && realFriend) {
      socket.emit("call-user", { to: realFriend, from: myId });
    }
  }

  keepAliveInterval = setInterval(() => {
    if (remoteStream && userVideo && userVideo.srcObject !== remoteStream) {
      userVideo.srcObject = remoteStream;
      userVideo.play?.().catch(() => {});
    }
  }, 800);

  function cleanupAndExit() {
    if (keepAliveInterval) {
      clearInterval(keepAliveInterval);
      keepAliveInterval = null;
    }

    if (localStream) {
      localStream.getTracks().forEach((track) => track.stop());
      localStream = null;
    }

    if (peer) {
      peer.onicecandidate = null;
      peer.ontrack = null;
      peer.onconnectionstatechange = null;
      peer.close();
      peer = null;
    }

    remoteStream = null;
    remoteDescSet = false;
    pendingCandidates.length = 0;
    sentInitialOffer = false;

    window.AppSpeechToSign?.cleanup?.();
    window.AppSignToSpeech?.cleanup?.();

    localStorage.removeItem("isCaller");
    localStorage.removeItem("callTo");
    sessionStorage.removeItem("senderAutoRefreshed");

    goBackAfterCall();
  }

  function hangUp() {
    if (realFriend) socket.emit("end-call", { to: realFriend, from: myId });
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
    const activeStream = myVideo?.srcObject || localStream;
    if (!activeStream) return showAlert("No camera stream");

    const tracks = activeStream.getVideoTracks();
    if (!tracks.length) return showAlert("No video track");

    const willEnable = !tracks[0].enabled;
    tracks.forEach((t) => (t.enabled = willEnable));

    if (myVideo) {
      myVideo.style.opacity = willEnable ? "1" : "0.15";
      myVideo.play?.().catch(() => {});
    }

    // local modules sync
    window.dispatchEvent(
      new CustomEvent("app:video-toggled", { detail: { enabled: willEnable } })
    );

    // remote side sync (UI + state awareness)
    if (realFriend) {
      socket.emit("video-toggled", {
        to: realFriend,
        from: myId,
        enabled: willEnable,
      });
    }

    showAlert(willEnable ? "Camera On" : "Camera Off");
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

  start().catch((e) => {
    console.error("video start error:", e);
    alert("Unable to start video call");
    window.location = "Chat.html";
  });
})();