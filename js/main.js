'use strict';

var localVideo = document.querySelector('#localVideo');
var remoteVideo = document.querySelector('#remoteVideo');

var isChannelReady = false;
var isInitiator = false;
var isStarted = false;
var localStream;
var pc;
var remoteStream;
var turnReady;

var pcConfig = {
  'iceServers': [{
    'urls': 'stun:stun.l.google.com:19302'
  }]
};

// Set up audio and video regardless of what devices are present.
var sdpConstraints = {
  offerToReceiveAudio: true,
  offerToReceiveVideo: true
};

// constraints on client media during the call
var constraints = {
  video: true,
  audio: true
};


//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
/// Handle all room related tasks
//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

var socket = io.connect();

function join_room(room){

  if (room !== '') {
    socket.emit('create or join', room);
    console.log('Attempted to create or join Room'+ room);
  }

  socket.on('created', function(room) {
    console.log('Created Room ' + room);
    isInitiator = true;
  });

  socket.on('full', function(room) {
    console.log('Room ' + room + ' is full.');
    window.location.replace("index.html");
    alert("Unable to enter !\nRoom is full, Check with the Councellor.")
    
  });

  socket.on('join', function (room){
    console.log('Another peer made a request to join room ' + room);
    console.log('This peer is the initiator of room ' + room + '!');
    isChannelReady = true;
    });

  socket.on('joined', function(room) {
    console.log('Joined: ' + room);
    isChannelReady = true;
  });

  socket.on('log', function(array) {
    console.log.apply(console, array);
  });

}


//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
/// Handle all Connection related tasks
//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
function sendMessage(message) {
  console.log('Client sending message: ', message);
  socket.emit('message', message);
}

// This client receives a message
socket.on('message', function(message) {
  console.log('Client received message:', message);
  if (message === 'got user media') {
    maybeStart();
  } else 
      if (message.type === 'offer') {
        if (!isInitiator && !isStarted) {
          maybeStart();
        }
      pc.setRemoteDescription(new RTCSessionDescription(message));
      doAnswer();
      } 
      else 
        if (message.type === 'answer' && isStarted) {
          pc.setRemoteDescription(new RTCSessionDescription(message));
        } 
        else 
          if (message.type === 'candidate' && isStarted) {
            var candidate = new RTCIceCandidate({
            sdpMLineIndex: message.label,
            candidate: message.candidate
          });
          pc.addIceCandidate(candidate);
          } 
          else 
            if (message === 'bye' && isStarted) {
              handleRemoteHangup();
            }
});

////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Get User Media and related actions
////////////////////////////////////////////////////////////////////////////////////////////////////////////////
  
navigator.mediaDevices.getUserMedia({
    video: true,
    audio: true
})
.then(gotStream)
.catch(function(e) {
  alert('getUserMedia() error: ' + e.name);
});

function gotStream(stream) {
  console.log('Adding local stream.');
  localStream = stream;
  localVideo.srcObject = stream;
  sendMessage('got user media');
  if (isInitiator) {
    maybeStart();
  }
}

console.log('Getting user media with constraints', constraints);

if (location.hostname !== 'localhost') {
  requestTurn(
    'https://computeengineondemand.appspot.com/turn?username=41784574&key=4080218913'
  );
}

  function maybeStart() {
    console.log('>>>>>>> maybeStart() ', isStarted, localStream, isChannelReady);
    if (!isStarted && typeof localStream !== 'undefined' && isChannelReady) {
      console.log('>>>>>> creating peer connection');
      createPeerConnection();
      pc.addStream(localStream);
      isStarted = true;
      console.log('isInitiator', isInitiator);
      if (isInitiator) {
        doCall();
      }
    }
  }

  window.onbeforeunload = function() {
    sendMessage('bye');
  };

////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Create and Manage Peer Connections
////////////////////////////////////////////////////////////////////////////////////////////////////////////////

function createPeerConnection() {
  try {
    pc = new RTCPeerConnection(null);
    pc.onicecandidate = handleIceCandidate;
    pc.onaddstream = handleRemoteStreamAdded;
    pc.onremovestream = handleRemoteStreamRemoved;
    console.log('Created RTCPeerConnnection');
  } 
  catch (e) {
    console.log('Failed to create PeerConnection, exception: ' + e.message);
    alert('Cannot create RTCPeerConnection object.');
    return;
    }
}

function handleIceCandidate(event) {
  console.log('icecandidate event: ', event);
  if (event.candidate) {
    sendMessage({
      type: 'candidate',
      label: event.candidate.sdpMLineIndex,
      id: event.candidate.sdpMid,
      candidate: event.candidate.candidate
    });
  } else {
    console.log('End of candidates.');
    }
}

function handleCreateOfferError(event) {
  console.log('createOffer() error: ', event);
}

function doCall() {
  console.log('Sending offer to peer');
  pc.createOffer(setLocalAndSendMessage, handleCreateOfferError);
}

function doAnswer() {
  console.log('Sending answer to peer.');
  pc.createAnswer().then(
    setLocalAndSendMessage,
    onCreateSessionDescriptionError
  );
}

function setLocalAndSendMessage(sessionDescription) {
  pc.setLocalDescription(sessionDescription);
  console.log('setLocalAndSendMessage sending message', sessionDescription);
  sendMessage(sessionDescription);
}

function onCreateSessionDescriptionError(error) {
  trace('Failed to create session description: ' + error.toString());
}

function requestTurn(turnURL) {
  var turnExists = false;
  for (var i in pcConfig.iceServers) {
    if (pcConfig.iceServers[i].urls.substr(0, 5) === 'turn:') {
      turnExists = true;
      turnReady = true;
      break;
    }
  }
  if (!turnExists) {
    console.log('Getting TURN server from ', turnURL);
    // No TURN server. Get one from computeengineondemand.appspot.com:
    var xhr = new XMLHttpRequest();
    xhr.onreadystatechange = function() {
      if (xhr.readyState === 4 && xhr.status === 200) {
        var turnServer = JSON.parse(xhr.responseText);
        console.log('Got TURN server: ', turnServer);
        pcConfig.iceServers.push({
          'urls': 'turn:' + turnServer.username + '@' + turnServer.turn,
          'credential': turnServer.password
        });
        turnReady = true;
      }
    };
    xhr.open('GET', turnURL, true);
    xhr.send();
  }
}

function handleRemoteStreamAdded(event) {
  console.log('Remote stream added.');
  remoteStream = event.stream;
  remoteVideo.srcObject = remoteStream;
}

function handleRemoteStreamRemoved(event) {
  console.log('Remote stream removed. Event: ', event);
}

function hangup() {
  console.log('Hanging up.');
  stop();
  sendMessage('bye');
}

function handleRemoteHangup() {
  console.log('Session terminated.');
  stop();
  isInitiator = false;
}

function stop() {
  isStarted = false;
  pc.close();
  pc = null;
}


//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
/// Toggle Mic and Video + End Call Buttons
//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

let mic_switch = true;
let video_switch = true;

function toggleVideo() { // toggle video
  if(localStream != null && localStream.getVideoTracks().length > 0){
    video_switch = !video_switch;
    localStream.getVideoTracks()[0].enabled = video_switch;
    document.getElementById('videobtn').innerHTML = (video_switch?"Stop ":"Start ")+"sharing video"; 
  }
}

function toggleMic() {// toggle mic
  if(localStream != null && localStream.getAudioTracks().length > 0){
    mic_switch = !mic_switch;
    localStream.getAudioTracks()[0].enabled = mic_switch;
    document.getElementById('micbtn').innerHTML = (mic_switch?"Stop ":"Start ")+"sharing audio";
  } 
}

