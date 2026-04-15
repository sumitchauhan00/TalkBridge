(function () {
  const baseURL = window.location.origin;
  const socket = io(baseURL);

  const user = JSON.parse(localStorage.getItem("user") || "{}");
  const myId = user?._id;
  const peerId = localStorage.getItem("callTo");
  const isCaller = localStorage.getItem("isCaller") === "true";

  // your video.html ids
  const localVideo = document.getElementById("myVideo");
  const remoteVideo = document.getElementById("userVideo");

  if (!myId || !peerId || !localVideo || !remoteVideo) {
    alert("Call initialization failed");
    window.location = "Chat.html"; // if your file is chat.html, change here
    return;
  }

  let pc = null;
  let localStream = null;
  let remoteDescSet = false;
  const pendingCandidates = [];

  function createPeer() {
    pc = new RTCPeerConnection({
      iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
    });

    pc.onicecandidate = (e) => {
      if (!e.candidate) return;
      socket.emit("ice-candidate", {
        to: peerId,
        from: myId,
        candidate: e.candidate,
      });
    };

    pc.ontrack = (e) => {
      const [stream] = e.streams;
      if (stream) {
        remoteVideo.srcObject = stream;
        remoteVideo.play?.().catch(() => {});
      }
    };

    pc.onconnectionstatechange = () => {
      console.log("pc.connectionState:", pc.connectionState);
    };
  }

  async function initMedia() {
    localStream = await navigator.mediaDevices.getUserMedia({
      video: true,
      audio: true,
    });

    localVideo.srcObject = localStream;
    localVideo.muted = true;
    localVideo.play?.().catch(() => {});

    localStream.getTracks().forEach((track) => {
      pc.addTrack(track, localStream);
    });
  }

  async function flushCandidates() {
    while (pendingCandidates.length) {
      const c = pendingCandidates.shift();
      try {
        await pc.addIceCandidate(new RTCIceCandidate(c));
      } catch (err) {
        console.error("pending ICE error:", err);
      }
    }
  }

  function wireSocket() {
    socket.emit("join", myId);

    // old incoming event name from server
    socket.on("call-made", async ({ from, offer }) => {
      try {
        if (!pc.currentRemoteDescription) {
          await pc.setRemoteDescription(new RTCSessionDescription(offer));
        }
        remoteDescSet = true;
        await flushCandidates();

        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);

        // support old + new server paths
        socket.emit("make-answer", { to: from, answer, from: myId });
        socket.emit("answer", { to: from, answer, from: myId });
      } catch (err) {
        console.error("call-made error:", err);
      }
    });

    // new incoming event name from server
    socket.on("offer", async ({ from, offer }) => {
      try {
        if (!pc.currentRemoteDescription) {
          await pc.setRemoteDescription(new RTCSessionDescription(offer));
        }
        remoteDescSet = true;
        await flushCandidates();

        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);

        socket.emit("make-answer", { to: from, answer, from: myId });
        socket.emit("answer", { to: from, answer, from: myId });
      } catch (err) {
        console.error("offer error:", err);
      }
    });

    // old answer event
    socket.on("answer-made", async ({ answer }) => {
      try {
        if (!pc.currentRemoteDescription) {
          await pc.setRemoteDescription(new RTCSessionDescription(answer));
        }
        remoteDescSet = true;
        await flushCandidates();
      } catch (err) {
        console.error("answer-made error:", err);
      }
    });

    // new answer event
    socket.on("answer", async ({ answer }) => {
      try {
        if (!pc.currentRemoteDescription) {
          await pc.setRemoteDescription(new RTCSessionDescription(answer));
        }
        remoteDescSet = true;
        await flushCandidates();
      } catch (err) {
        console.error("answer error:", err);
      }
    });

    socket.on("ice-candidate", async ({ candidate }) => {
      try {
        if (!candidate) return;
        if (!remoteDescSet) {
          pendingCandidates.push(candidate);
          return;
        }
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (err) {
        console.error("ice-candidate error:", err);
      }
    });

    socket.on("call-ended", () => {
      cleanupAndBack();
    });

    socket.on("call-declined", () => {
      alert("Call declined");
      cleanupAndBack();
    });
  }

  async function startAsCaller() {
    const offer = await pc.createOffer({
      offerToReceiveAudio: true,
      offerToReceiveVideo: true,
    });
    await pc.setLocalDescription(offer);

    // support old + new server paths
    socket.emit("call-user", { to: peerId, from: myId, offer });
    socket.emit("offer", { to: peerId, from: myId, offer });
  }

  function cleanup() {
    try {
      if (localStream) {
        localStream.getTracks().forEach((t) => t.stop());
      }
      if (pc) pc.close();

      socket.off("call-made");
      socket.off("offer");
      socket.off("answer-made");
      socket.off("answer");
      socket.off("ice-candidate");
      socket.off("call-ended");
      socket.off("call-declined");
    } catch (_) {}
  }

  function cleanupAndBack() {
    cleanup();
    window.location = "Chat.html"; // if your file is chat.html, change here
  }

  // used by video.html button onclick="hangUp()"
  window.hangUp = function () {
    socket.emit("end-call", { to: peerId, from: myId });     // old
    socket.emit("call-ended", { to: peerId, from: myId });   // new
    cleanupAndBack();
  };

  // safe fallbacks for existing buttons
  window.toggleMute = function () {
    if (!localStream) return;
    const audioTrack = localStream.getAudioTracks()[0];
    if (!audioTrack) return;
    audioTrack.enabled = !audioTrack.enabled;
  };

  window.toggleVideo = function () {
    if (!localStream) return;
    const videoTrack = localStream.getVideoTracks()[0];
    if (!videoTrack) return;
    videoTrack.enabled = !videoTrack.enabled;
  };

  window.addEventListener("beforeunload", () => {
    socket.emit("end-call", { to: peerId, from: myId });
    socket.emit("call-ended", { to: peerId, from: myId });
    cleanup();
  });

  (async function init() {
    try {
      createPeer();
      wireSocket();
      await initMedia();

      if (isCaller) {
        await startAsCaller();
      }
    } catch (err) {
      console.error("video init error:", err);
      alert("Unable to start video call");
      window.location = "Chat.html"; // if your file is chat.html, change here
    }
  })();
})();