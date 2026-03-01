const SERVER_URL = 'https://chatapp-server-e97e.onrender.com';

let socket = null, myUsername = null, myToken = null, myAvatar = null;
let currentChannel = null, currentVoiceChannel = null;
let isMuted = false, isDeafened = false, isSharing = false;
let peers = {}, localStream = null, screenStream = null;

const $ = id => document.getElementById(id);
// Notifications
let unreadCounts = {}; // { channelId: count }
const notificationSound = new Audio('https://assets.mixkit.co/active_storage/sfx/2354/2354-preview.mp3');
const joinSound = new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3');
const leaveSound = new Audio('https://assets.mixkit.co/active_storage/sfx/2870/2870-preview.mp3'); 

// AUTH
let isRegistering = false;
$('tab-login').onclick = () => switchTab('login');
$('tab-register').onclick = () => switchTab('register');

function switchTab(tab) {
  isRegistering = tab === 'register';
  $('tab-login').classList.toggle('act', !isRegistering);
  $('tab-register').classList.toggle('act', isRegistering);
  $('auth-submit').textContent = isRegistering ? "S'inscrire" : 'Se connecter';
  $('auth-error').textContent = '';
}

$('auth-submit').onclick = async () => {
  const username = $('auth-username').value.trim();
  const password = $('auth-password').value;
  if (!username || !password) return ($('auth-error').textContent = 'Remplis tous les champs');
  $('auth-error').textContent = '';
  $('auth-submit').disabled = true;
  try {
    const route = isRegistering ? '/register' : '/login';
    const res = await fetch(SERVER_URL + route, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    const data = await res.json();
    if (!res.ok) { $('auth-error').textContent = data.error; $('auth-submit').disabled = false; return; }
    myToken = data.token;
    myUsername = data.username;
    myAvatar = data.avatar;
    localStorage.setItem('token', myToken);
    localStorage.setItem('username', myUsername);
    if (myAvatar) {
    localStorage.setItem('avatar', myAvatar);
   } 
    startApp();
  } catch {
    $('auth-error').textContent = 'Impossible de contacter le serveur';
    $('auth-submit').disabled = false;
  }
};

$('auth-password').onkeydown = e => { if (e.key === 'Enter') $('auth-submit').click(); };
$('logout-btn').onclick = () => { localStorage.clear(); location.reload(); };

// AUTO LOGIN
const savedToken = localStorage.getItem('token');
const savedUsername = localStorage.getItem('username');
const savedAvatar = localStorage.getItem('avatar');
if (savedToken && savedUsername) { 
  myToken = savedToken; 
  myUsername = savedUsername; 
  myAvatar = (savedAvatar && savedAvatar !== 'null') ? savedAvatar : null;
  startApp(); 
}

function startApp() {
  $('auth-screen').classList.add('hidden');
  $('app').classList.remove('hidden');
  $('my-username').textContent = myUsername;
  console.log('startApp - myAvatar avant updateMyAvatar:', myAvatar);
  updateMyAvatar();
  connectSocket();
  loadChannels();

 // Définir les fonctions d'édition/suppression
  window.editMessage = function(messageId) {
  const msgEl = document.querySelector(`[data-msg-id="${messageId}"]`);
  if (!msgEl) return;
  
  const contentEl = msgEl.querySelector('.msg-content');
  if (!contentEl) return;
  
  const currentText = contentEl.textContent;
  
  // Ouvrir le modal
  const modal = $('edit-modal');
  const textarea = $('edit-textarea');
  const saveBtn = $('edit-save-btn');
  const cancelBtn = $('edit-cancel-btn');
  
  textarea.value = currentText;
  modal.classList.remove('hidden');
  textarea.focus();
  
  // Sauvegarder
  saveBtn.onclick = () => {
    const newText = textarea.value.trim();
    if (newText && newText !== currentText) {
      socket.emit('edit_message', { messageId, newContent: newText });
    }
    modal.classList.add('hidden');
  };
  
  // Annuler
  cancelBtn.onclick = () => {
    modal.classList.add('hidden');
  };
};

  window.deleteMessage = function(messageId) {
  // Ouvrir le modal de confirmation
  const modal = $('delete-modal');
  const confirmBtn = $('delete-confirm-btn');
  const cancelBtn = $('delete-cancel-btn');
  
  modal.classList.remove('hidden');
  
  // Confirmer la suppression
  confirmBtn.onclick = () => {
    socket.emit('delete_message', { messageId });
    modal.classList.add('hidden');
    setTimeout(() => {
      const input = $('msg-input');
      if (input) input.focus();
    }, 100);
  };
  
  // Annuler
  cancelBtn.onclick = () => {
    modal.classList.add('hidden');
    setTimeout(() => {
      const input = $('msg-input');
      if (input) input.focus();
    }, 100);
  };
};
} 

// Changement d'avatar


$('change-avatar-btn').onclick = () => {
  $('avatar-input').click();
};

$('avatar-input').onchange = async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  
  // Vérifier la taille (max 5MB)
  if (file.size > 5 * 1024 * 1024) {
    alert('L\'image est trop grosse (max 5MB)');
    return;
  }
  
  const formData = new FormData();
  formData.append('avatar', file);
  
  try {
    const res = await fetch(SERVER_URL + '/upload-avatar', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + myToken },
      body: formData
    });
    
    const data = await res.json();
    if (!res.ok) {
      alert(data.error || 'Erreur upload');
      return;
    }
    
    // Mettre à jour l'avatar localement
    myAvatar = data.avatar;
    localStorage.setItem('avatar', myAvatar);
    updateMyAvatar();
  } catch (err) {
    console.error('Erreur upload avatar:', err);
    alert('Impossible d\'uploader l\'image');
  }
};

function updateMyAvatar() {
  console.log('updateMyAvatar appelé, myAvatar =', myAvatar, typeof myAvatar);
  const avatarEl = $('my-avatar');
  if (myAvatar && myAvatar !== 'null') {
    // Si c'est une URL Cloudinary (commence par http), l'utiliser directement
    const avatarUrl = myAvatar.startsWith('http') ? myAvatar : SERVER_URL + myAvatar;
    avatarEl.innerHTML = `<img src="${avatarUrl}" alt="Avatar">`;
  } else {
    avatarEl.textContent = myUsername[0].toUpperCase();
  }
}

// SOCKET
function connectSocket() {
  socket = io(SERVER_URL, { auth: { token: myToken } });
  socket.on('new_message', (msg) => {
  console.log('Message reçu:', msg);

// Écouter les modifications de messages
socket.on('message_edited', ({ messageId, content, edited }) => {
  const msgEl = document.querySelector(`[data-msg-id="${messageId}"]`);
  if (!msgEl) return;
  
  const contentEl = msgEl.querySelector('.msg-content');
  const timeEl = msgEl.querySelector('.msg-time');
  
  if (contentEl) contentEl.textContent = content;
  if (timeEl && edited && !msgEl.querySelector('.msg-edited')) {
    timeEl.insertAdjacentHTML('afterend', '<span class="msg-edited">(modifié)</span>');
  }
});

// Écouter les suppressions de messages
socket.on('message_deleted', ({ messageId }) => {
  const msgEl = document.querySelector(`[data-msg-id="${messageId}"]`);
  if (msgEl) {
    msgEl.remove();
    // Forcer le focus sur l'input après suppression
    setTimeout(() => {
      const input = $('msg-input');
      if (input) input.focus();
    }, 50);
  }
});

  // Si le message vient d'un autre salon, incrémenter le compteur
  if (msg.channelId && msg.channelId !== currentChannel && msg.username !== myUsername) {
    console.log('Notification pour salon:', msg.channelId, 'currentChannel:', currentChannel);
    unreadCounts[msg.channelId] = (unreadCounts[msg.channelId] || 0) + 1;
    updateChannelBadges();
    notificationSound.play().catch(() => {});
  }
  // Afficher le message SEULEMENT si c'est le bon salon
  if (msg.channelId === currentChannel) {
    addMessage(msg);
  }
});
  socket.on('channel_history', msgs => { $('messages-area').innerHTML = ''; msgs.forEach(addMessage); scrollBottom(); });
  socket.on('online_users', users => {
  $('members-list').innerHTML = '';
  users.forEach(user => {
    const username = user.username || user;
    const avatar = user.avatar;
    
    const el = document.createElement('div');
    el.className = 'member-item';
    
    const avatarUrl = avatar ? (avatar.startsWith('http') ? avatar : SERVER_URL + avatar) : null;
    el.innerHTML = `
      <div class="member-avatar">
        ${avatarUrl ? `<img src="${avatarUrl}" alt="${username}">` : username[0].toUpperCase()}
      </div>
      <span>${username}</span>
    `;
    $('members-list').appendChild(el);
  });
});
  socket.on('voice_rooms_state', updateVoiceRooms);
  socket.on('voice_peers', async list => { for (const { peerId, username } of list) await createPeer(peerId, true, username); });
  socket.on('peer_joined', async ({ peerId, username, avatar }) => {
  await createPeer(peerId, false, username);
  joinSound.play().catch(() => {});
});
  socket.on('signal', ({ from, signal }) => { if (peers[from]) peers[from].peer.signal(signal); });
  socket.on('peer_left', ({ peerId }) => {
    if (peers[peerId]) { peers[peerId].peer.destroy(); delete peers[peerId]; }
    const box = document.getElementById('stream-' + peerId);
    if (box) box.remove();
    leaveSound.play().catch(() => {});
  });
}

// CHANNELS
async function loadChannels() {
  const res = await fetch(SERVER_URL + '/channels');
  const data = await res.json();
  $('text-channels').innerHTML = '';
  $('voice-channels').innerHTML = '';
  data.text.forEach(ch => {
    const el = document.createElement('div');
    el.className = 'channel-item';
    el.id = 'ch-' + ch.id;
    el.innerHTML = `<span style="color:var(--t3);font-size:16px">#</span>${ch.name}`;
    el.onclick = () => joinTextChannel(ch);
    $('text-channels').appendChild(el);
  });
  data.voice.forEach(ch => {
    const el = document.createElement('div');
    el.className = 'channel-item';
    el.id = 'ch-' + ch.id;
    el.innerHTML = ch.name;
    el.onclick = () => joinVoiceChannel(ch);
    $('voice-channels').appendChild(el);
  });
}

function updateVoiceRooms(state) {
  Object.entries(state).forEach(([cId, usersList]) => {
    const el = document.getElementById('ch-' + cId);
    if (!el) return;
    let sub = el.nextElementSibling;
    if (sub && sub.classList.contains('channel-voice-users')) sub.remove();
    
    if (usersList.length > 0) {
      const s = document.createElement('div');
      s.className = 'channel-voice-users';
      s.textContent = usersList.map(u => u.username || u).join(', ');
      el.after(s);
    }
    
    if (cId === currentVoiceChannel) {
  const usersEl = $('voice-bar-users');
  usersEl.innerHTML = '';
  
  // Ajouter ton propre utilisateur d'abord
  const myUserDiv = document.createElement('div');
  myUserDiv.className = 'voice-user-item';
  myUserDiv.innerHTML = `
    <div class="voice-user-avatar">
      ${myAvatar ? `<img src="${myAvatar.startsWith('http') ? myAvatar : SERVER_URL + myAvatar}" alt="${myUsername}">` : myUsername[0].toUpperCase()}
    </div>
    <span>${myUsername}</span>
  `;
  usersEl.appendChild(myUserDiv);
  
  // Puis ajouter les autres utilisateurs
  usersList.forEach(user => {
    const peerEntry = Object.entries(peers).find(([id, data]) => data.username === (user.username || user));
    if (!peerEntry) return;
    
    const [peerId, peerData] = peerEntry;
    const userDiv = document.createElement('div');
    userDiv.className = 'voice-user-item';
    userDiv.id = 'voice-user-' + peerId;
    
    const username = user.username || user;
    const avatar = user.avatar;
    
    userDiv.innerHTML = `
      <div class="voice-user-avatar">
        ${avatar ? `<img src="${avatar.startsWith('http') ? avatar : SERVER_URL + avatar}" alt="${username}">` : username[0].toUpperCase()}
      </div>
      <span>${username}</span>
      <button class="voice-user-volume-btn" onclick="toggleVolumePopup('${peerId}', event)">🔊</button>
    `;
    usersEl.appendChild(userDiv);
  });
}
  });
}


// Gestion des volumes individuels
let userVolumes = {}; // { peerId: volume (0-200) }

// Charger les volumes sauvegardés
const savedVolumes = localStorage.getItem('userVolumes');
if (savedVolumes) {
  userVolumes = JSON.parse(savedVolumes);
}

window.toggleVolumePopup = function(peerId, event) {
  event.stopPropagation();
  
  // Fermer les autres popups
  document.querySelectorAll('.volume-popup').forEach(p => p.remove());
  
  const currentVolume = userVolumes[peerId] || 100;
  
  const popup = document.createElement('div');
  popup.className = 'volume-popup';
  popup.innerHTML = `
    <div class="volume-popup-header">Volume</div>
    <input type="range" class="volume-slider" min="0" max="200" value="${currentVolume}" id="volume-slider-${peerId}">
    <div class="volume-value" id="volume-value-${peerId}">${currentVolume}%</div>
  `;
  
  const userEl = document.getElementById('voice-user-' + peerId);
  userEl.appendChild(popup);
  
  // Gérer le changement de volume
  const slider = document.getElementById('volume-slider-' + peerId);
  const valueDisplay = document.getElementById('volume-value-' + peerId);
  
  slider.oninput = () => {
    const volume = parseInt(slider.value);
    valueDisplay.textContent = volume + '%';
    userVolumes[peerId] = volume;
    localStorage.setItem('userVolumes', JSON.stringify(userVolumes));
    applyVolume(peerId, volume);
  };
  
  // Fermer au clic extérieur
  setTimeout(() => {
    document.addEventListener('click', function closePopup(e) {
      if (!popup.contains(e.target)) {
        popup.remove();
        document.removeEventListener('click', closePopup);
      }
    });
  }, 10);
};

function applyVolume(peerId, volume) {
  const audio = document.querySelector(`audio[data-peer-id="${peerId}"]`);
  if (audio) {
    audio.volume = volume / 100;
  }
}

// TEXT CHANNEL
function joinTextChannel(ch) {
  // Réinitialiser le compteur de ce salon
unreadCounts[ch.id] = 0;
updateChannelBadges();
  document.querySelectorAll('.channel-item').forEach(e => e.classList.remove('active'));
  document.getElementById('ch-' + ch.id)?.classList.add('active');
  currentChannel = ch.id;
  $('channel-name').textContent = ch.name;
  $('input-area').classList.remove('hidden');
  $('messages-area').innerHTML = '';
  socket.emit('join_channel', ch.id);
}

// MESSAGES
function addMessage(msg) {
  
  const div = document.createElement('div');
  div.className = 'message';
  div.setAttribute('data-msg-id', msg._id);
  const time = new Date(msg.timestamp).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  let content = '';
  if (msg.type === 'image') {
  content = `<img class="msg-image" src="${SERVER_URL}${msg.fileUrl}" onclick="window.open('${SERVER_URL}${msg.fileUrl}')" />`;
} else if (msg.type === 'file') {
  content = `<a class="msg-file" href="${SERVER_URL}${msg.fileUrl}" target="_blank">📎 ${msg.fileName}</a>`;
} else {
  // Détection auto des URLs d'images/GIFs
  if (msg.content && (msg.content.includes('.gif') || msg.content.includes('tenor.com') || msg.content.includes('.jpg') || msg.content.includes('.png'))) {
    content = `<img class="msg-image" src="${msg.content}" onclick="window.open('${msg.content}')" />`;
  } else {
    content = `<div class="msg-content">${escapeHtml(msg.content)}</div>`;
  }
}
const isOwnMessage = msg.username === myUsername;
const editedLabel = msg.edited ? '<span class="msg-edited">(modifié)</span>' : '';

div.innerHTML = `
  <div class="msg-avatar">
    ${msg.avatar ? `<img src="${msg.avatar.startsWith('http') ? msg.avatar : SERVER_URL + msg.avatar}" alt="${msg.username}">` : msg.username[0].toUpperCase()}
  </div>
  <div class="msg-body">
    <div class="msg-header">
      <span class="msg-username">${escapeHtml(msg.username)}</span>
      <span class="msg-time">Aujourd'hui à ${time}</span>${editedLabel}
    </div>
    ${content}
  </div>
  ${isOwnMessage ? `
    <div class="msg-actions">
      <button class="msg-action-btn" onmousedown="event.preventDefault()" onclick="editMessage('${msg._id}')">✏️</button>
      <button class="msg-action-btn" onmousedown="event.preventDefault()" onclick="deleteMessage('${msg._id}')">🗑️</button>
    </div>
  ` : ''}
`;
  $('messages-area').appendChild(div);
  scrollBottom();
}

function scrollBottom() { $('messages-area').scrollTop = $('messages-area').scrollHeight; }

$('send-btn').onclick = sendMessage;
$('msg-input').onkeydown = e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } };

function sendMessage() {
  const content = $('msg-input').value.trim();
  if (!content || !currentChannel) return;
  console.log('Envoi message, currentChannel:', currentChannel, 'content:', content); // ← DEBUG
  socket.emit('send_message', { channelId: currentChannel, content, type: 'text' });
  $('msg-input').value = '';
}

// FICHIERS
$('file-input').onchange = async () => {
  const file = $('file-input').files[0];
  if (!file || !currentChannel) return;
  const fd = new FormData();
  fd.append('file', file);
  try {
    const res = await fetch(SERVER_URL + '/upload', { method: 'POST', body: fd });
    const data = await res.json();
    socket.emit('send_message', { channelId: currentChannel, content: '', fileUrl: data.url, fileName: data.name, type: file.type.startsWith('image/') ? 'image' : 'file' });
  } catch (e) { console.error('Upload échoué:', e); }
  $('file-input').value = '';
};

// VOIX
async function joinVoiceChannel(ch) {
  if (currentVoiceChannel) await leaveVoice();
  try { localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false }); }
  catch { alert('Impossible d\'accéder au micro !'); return; }
  currentVoiceChannel = ch.id;
  document.querySelectorAll('.channel-item').forEach(e => e.classList.remove('active'));
  document.getElementById('ch-' + ch.id)?.classList.add('active');
  $('voice-bar').classList.remove('hidden');
  $('voice-bar-name').textContent = ch.name;
  $('remote-streams').classList.remove('hidden');
  socket.emit('join_voice', ch.id);
}

$('leave-voice-btn').onclick = leaveVoice;

async function leaveVoice() {
  if (!currentVoiceChannel) return;
  socket.emit('leave_voice', currentVoiceChannel);
  if (localStream) { localStream.getTracks().forEach(t => t.stop()); localStream = null; }
  Object.keys(peers).forEach(id => { peers[id].peer.destroy(); });
  peers = {};
  $('remote-streams').innerHTML = '';
  $('remote-streams').classList.add('hidden');
  $('voice-bar').classList.add('hidden');
  document.getElementById('ch-' + currentVoiceChannel)?.classList.remove('active');
  currentVoiceChannel = null;
}

$('mute-btn').onclick = () => {
  isMuted = !isMuted;
  if (localStream) localStream.getAudioTracks().forEach(t => t.enabled = !isMuted);
  $('mute-btn').textContent = isMuted ? '🔇' : '🎙️';
  $('mute-btn').classList.toggle('active', isMuted);
};

$('deafen-btn').onclick = () => {
  isDeafened = !isDeafened;
  document.querySelectorAll('.remote-audio').forEach(a => a.muted = isDeafened);
  $('deafen-btn').textContent = isDeafened ? '🔕' : '🔊';
  $('deafen-btn').classList.toggle('active', isDeafened);
};

$('screen-btn').onclick = async () => {
  if (!currentVoiceChannel) return;
  if (isSharing) {
    if (screenStream) { screenStream.getTracks().forEach(t => t.stop()); screenStream = null; }
    isSharing = false;
    $('screen-btn').classList.remove('active');
    $('screen-btn').textContent = '🖥️';
  } else {
  try {
    // Récupérer les sources disponibles
    const sources = await window.electronAPI.getDesktopSources();
    
    if (!sources || sources.length === 0) {
      console.error('Aucune source d\'écran disponible');
      return;
    }
    
    // Afficher le modal de sélection
    const modal = $('screen-source-modal');
    const sourcesList = $('screen-sources-list');
    const cancelBtn = $('screen-source-cancel-btn');
    
    // Vider la liste
    sourcesList.innerHTML = '';
    
    // Ajouter chaque source
    sources.forEach(source => {
      const item = document.createElement('div');
      item.className = 'screen-source-item';
      item.innerHTML = `
        <img src="${source.thumbnail.toDataURL()}" alt="${source.name}">
        <p>${source.name}</p>
      `;
      
      item.onclick = async () => {
        modal.classList.add('hidden');
        await startScreenShare(source.id);
      };
      
      sourcesList.appendChild(item);
    });
    
    modal.classList.remove('hidden');
    
    cancelBtn.onclick = () => {
      modal.classList.add('hidden');
    };
    
  } catch (e) { 
    console.error('Screen share échoué:', e); 
  }
 }
};

async function startScreenShare(sourceId) {
  try {
    screenStream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        mandatory: {
          chromeMediaSource: 'desktop',
          chromeMediaSourceId: sourceId
        }
      }
    });

    isSharing = true;
    $('screen-btn').classList.add('active');
    $('screen-btn').textContent = '🛑';
    screenStream.getVideoTracks()[0].onended = () => $('screen-btn').click();
    
  
    // Diffuser le flux d'écran à tous les peers connectés
Object.keys(peers).forEach(peerId => {
  const peerData = peers[peerId];
  if (peerData && peerData.peer) {
    peerData.peer.addStream(screenStream);
  }
});
} catch (e) { 
    console.error('Screen share échoué:', e); 
  }
 }
// ═══════════════════════════════════════════════════════════════
// GESTION DES BADGES DE NOTIFICATION
// ═══════════════════════════════════════════════════════════════

function updateChannelBadges() {
  console.log('updateChannelBadges appelé, unreadCounts:', unreadCounts); // ← DEBUG
  Object.keys(unreadCounts).forEach(channelId => {
    const count = unreadCounts[channelId];
    const channelEl = document.getElementById('ch-' + channelId);
    console.log('Salon:', channelId, 'count:', count, 'element trouvé:', channelEl); // ← DEBUG
    if (!channelEl) return;
    
    const oldBadge = channelEl.querySelector('.channel-badge');
    if (oldBadge) oldBadge.remove();
    
    if (count > 0) {
      const badge = document.createElement('span');
      badge.className = 'channel-badge';
      badge.textContent = count > 99 ? '99+' : count;
      channelEl.appendChild(badge);
      console.log('Badge ajouté sur', channelId, 'avec count:', count); // ← DEBUG
    }
  });
}
// WebRTC
async function createPeer(peerId, initiator, username) {
  const peer = new SimplePeer({
    initiator, stream: localStream, trickle: true,
    config: { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] }
  });
  peer.on('signal', signal => socket.emit('signal', { to: peerId, signal }));
  peer.on('stream', stream => {
  // Vérifier s'il y a une vidéo (partage d'écran)
  const hasVideo = stream.getVideoTracks().length > 0;
  
  if (hasVideo) {
  // Supprimer l'ancienne vidéo s'il y en a une
  const oldVideo = document.getElementById('remote-video-' + peerId);
  if (oldVideo) oldVideo.remove();
  
  // Créer la nouvelle vidéo
const video = document.createElement('video');
video.id = 'remote-video-' + peerId;
video.className = 'remote-video';
video.autoplay = true;
video.srcObject = stream;
$('remote-streams').appendChild(video);

video.onclick = () => {
  video.classList.toggle('video-enlarged');
};
} else {
    // Audio seulement
    const audio = document.createElement('audio');
    audio.autoplay = true;
    audio.className = 'remote-audio';
    audio.srcObject = stream;
    audio.setAttribute('data-peer-id', peerId);
    if (isDeafened) audio.muted = true;
    document.body.appendChild(audio);

    // Appliquer le volume sauvegardé
    const savedVolume = userVolumes[peerId] || 100;
    audio.volume = savedVolume / 100;

  }
});
  peer.on('error', e => console.error('Peer error:', e));
  peers[peerId] = { peer, username };
}

$('members-btn').onclick = () => {
  const p = $('members-panel');
  p.style.display = p.style.display === 'none' ? '' : 'none';
};

function escapeHtml(str) {
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
// ═══════════════════════════════════════════════════════════════
// EMOJI/GIF PICKER
// ═══════════════════════════════════════════════════════════════

const emojis = ['😀','😃','😄','😁','😆','😅','🤣','😂','🙂','🙃','😉','😊','😇','🥰','😍','🤩','😘','😗','☺️','😚','😙','🥲','😋','😛','😜','🤪','😝','🤑','🤗','🤭','🤫','🤔','🤐','🤨','😐','😑','😶','😏','😒','🙄','😬','🤥','😌','😔','😪','🤤','😴','😷','🤒','🤕','🤢','🤮','🤧','🥵','🥶','🥴','😵','🤯','🤠','🥳','🥸','😎','🤓','🧐','😕','😟','🙁','☹️','😮','😯','😲','😳','🥺','😦','😧','😨','😰','😥','😢','😭','😱','😖','😣','😞','😓','😩','😫','🥱','😤','😡','😠','🤬','😈','👿','💀','☠️','💩','🤡','👹','👺','👻','👽','👾','🤖','😺','😸','😹','😻','😼','😽','🙀','😿','😾','🙈','🙉','🙊','💋','💌','💘','💝','💖','💗','💓','💞','💕','💟','❣️','💔','❤️','🧡','💛','💚','💙','💜','🤎','🖤','🤍','💯','💢','💥','💫','💦','💨','🕳️','💬','👁️‍🗨️','🗨️','🗯️','💭','💤','👋','🤚','🖐️','✋','🖖','👌','🤌','🤏','✌️','🤞','🤟','🤘','🤙','👈','👉','👆','🖕','👇','☝️','👍','👎','✊','👊','🤛','🤜','👏','🙌','👐','🤲','🤝','🙏','✍️','💅','🤳','💪','🦾','🦿','🦵','🦶','👂','🦻','👃','🧠','🫀','🫁','🦷','🦴','👀','👁️','👅','👄','🎂','🎉','🎊','🎈','🎁','🏆','🏅','🥇','🥈','🥉','⚽','🏀','🏈','⚾','🥎','🎾','🏐','🏉','🥏','🎱','🪀','🏓','🏸','🏒','🏑','🥍','🏏','🪃','🥅','⛳','🪁','🏹','🎣','🤿','🥊','🥋','🎽','🛹','🛼','🛷','⛸️','🥌','🎿','⛷️','🏂','🪂','🏋️','🤼','🤸','🤺','⛹️','🤾','🏌️','🏇','🧘','🏊','🤽','🚣','🧗','🚴','🚵','🎖️','🎗️','🎫','🎟️','🎪','🎭','🎨','🎬','🎤','🎧','🎼','🎹','🥁','🪘','🎷','🎺','🪗','🎸','🪕','🎻','🎲','♟️','🎯','🎳','🎮','🎰','🧩'];

const emojiPicker = $('emoji-picker');
const emojiBtn = $('emoji-btn');
const emojiGrid = $('emoji-grid');
const gifGrid = $('gif-grid');
const gifSearch = $('gif-search');
const emojiContent = $('emoji-content');
const gifContent = $('gif-content');

// Remplir les émojis
emojis.forEach(emoji => {
  const div = document.createElement('div');
  div.className = 'emoji-item';
  div.textContent = emoji;
  div.onclick = () => {
    $('msg-input').value += emoji;
    $('msg-input').focus();
  };
  emojiGrid.appendChild(div);
});

// Toggle picker
emojiBtn.onclick = (e) => {
  e.stopPropagation();
  emojiPicker.classList.toggle('hidden');
};

// Fermer si clic ailleurs
document.addEventListener('click', (e) => {
  if (!emojiPicker.contains(e.target) && e.target !== emojiBtn) {
    emojiPicker.classList.add('hidden');
  }
});

// Tabs émoji/gif
document.querySelectorAll('.emoji-tab').forEach(tab => {
  tab.onclick = () => {
    document.querySelectorAll('.emoji-tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    if (tab.dataset.tab === 'emoji') {
      emojiContent.classList.remove('hidden');
      gifContent.classList.add('hidden');
    } else {
      emojiContent.classList.add('hidden');
      gifContent.classList.remove('hidden');
      if (gifGrid.children.length === 0) loadTrendingGifs();
    }
  };
});

// Recherche GIF
let gifTimeout;
gifSearch.oninput = () => {
  clearTimeout(gifTimeout);
  gifTimeout = setTimeout(() => {
    const query = gifSearch.value.trim();
    if (query) searchGifs(query);
    else loadTrendingGifs();
  }, 500);
};

// Charger GIFs tendance
async function loadTrendingGifs() {
  gifGrid.innerHTML = '<div style="grid-column:1/-1;text-align:center;color:var(--t3);padding:20px">Chargement...</div>';
  try {
    const res = await fetch('https://tenor.googleapis.com/v2/featured?key=AIzaSyAyimkuYQYF_FXVALexPuGQctUWRURdCYQ&limit=20');
    const data = await res.json();
    displayGifs(data.results);
  } catch {
    gifGrid.innerHTML = '<div style="grid-column:1/-1;text-align:center;color:var(--red);padding:20px">Erreur de chargement</div>';
  }
}

// Rechercher GIFs
async function searchGifs(query) {
  gifGrid.innerHTML = '<div style="grid-column:1/-1;text-align:center;color:var(--t3);padding:20px">Recherche...</div>';
  try {
    const res = await fetch(`https://tenor.googleapis.com/v2/search?q=${encodeURIComponent(query)}&key=AIzaSyAyimkuYQYF_FXVALexPuGQctUWRURdCYQ&limit=20`);
    const data = await res.json();
    displayGifs(data.results);
  } catch {
    gifGrid.innerHTML = '<div style="grid-column:1/-1;text-align:center;color:var(--red);padding:20px">Erreur de recherche</div>';
  }
}

// Afficher GIFs
function displayGifs(gifs) {
  gifGrid.innerHTML = '';
  if (!gifs || gifs.length === 0) {
    gifGrid.innerHTML = '<div style="grid-column:1/-1;text-align:center;color:var(--t3);padding:20px">Aucun résultat</div>';
    return;
  }
  gifs.forEach(gif => {
    const img = document.createElement('img');
    img.className = 'gif-item';
    img.src = gif.media_formats.tinygif.url;
    img.onclick = () => {
      const gifUrl = gif.media_formats.gif.url;
      socket.emit('send_message', { channelId: currentChannel, content: gifUrl, fileUrl: null, fileName: null, type: 'text' });
      emojiPicker.classList.add('hidden');
    };
    gifGrid.appendChild(img);
  });
}

// Écouter les modifications de messages
socket.on('message_edited', ({ messageId, content, edited }) => {
  const msgEl = document.querySelector(`[data-msg-id="${messageId}"]`);
  if (!msgEl) return;
  
  const contentEl = msgEl.querySelector('.msg-content');
  const timeEl = msgEl.querySelector('.msg-time');
  
  if (contentEl) contentEl.textContent = content;
  if (timeEl && edited && !msgEl.querySelector('.msg-edited')) {
    timeEl.insertAdjacentHTML('afterend', '<span class="msg-edited">(modifié)</span>');
  }
});

// Écouter les suppressions de messages
socket.on('message_deleted', ({ messageId }) => {
  const msgEl = document.querySelector(`[data-msg-id="${messageId}"]`);
  if (msgEl) msgEl.remove();
});