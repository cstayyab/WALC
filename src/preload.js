const { ipcRenderer } = require('electron');

let icon = ipcRenderer.invoke('getIcon').then((value) => icon = value);

// override Notification API so it can show the window on click
window.oldNotification = Notification;
window.Notification = function (title, options) {
	const n = new window.oldNotification(title, options);
	n.addEventListener('click', function () {
		ipcRenderer.send('focusWindow');
	});
	return n;
};
Object.assign(window.Notification, window.oldNotification);

const badge = {
	x: 180,
	y: 180,
	radius: 120,
	font: 172,
	fontSmall: 124,
};

async function renderTray() {
	let unread = 0;
	const countMuted = await ipcRenderer.invoke('getSettings', 'countMuted.value');
	let allMuted = countMuted;
	if(window.Store && window.Store.Chat) {
		const chats = window.Store.Chat.getModelsArray();
		unread = chats.reduce((total, chat) => {
			// don't count if user disable counter on muted chats
			if (!countMuted && chat.mute.isMuted) {
				return total;
			}
			if (chat.unreadCount > 0 && !chat.mute.isMuted) {
				allMuted = false;
			}
			return total + chat.unreadCount;
		}, 0);
	}
	const canvas = document.createElement('canvas');
	const logo = new Image();
	const ctx = canvas.getContext('2d');

	logo.onload = () => {
		canvas.width = logo.naturalWidth;
		canvas.height = logo.naturalHeight;

		if(!window.Store || window.Store.AppState.state !== 'CONNECTED') {
			ctx.filter = 'grayscale(100%)';
		}
		ctx.drawImage(logo, 0, 0);
		ctx.filter = 'none';
		if (unread > 0) {
			unread = (unread > 99 ? 99 : unread);
			if (allMuted) {
				ctx.fillStyle = 'gray';
			} else {
				ctx.fillStyle = 'red';
			}
			ctx.arc(badge.x, badge.y, badge.radius, 0, 2 * Math.PI);
			ctx.fill();
			ctx.fillStyle = 'white';
			ctx.font = (unread < 10 ? badge.font : badge.fontSmall) + 'px sans-serif';
			ctx.textAlign = 'center';
			ctx.textBaseline = 'middle';
			ctx.fillText(unread, badge.x, badge.y);
		}

		ipcRenderer.send('renderTray', canvas.toDataURL());
	};
	logo.src = icon;
}

function appStateChange(event, state) {
	if (['OPENING', 'DISCONNECTED', 'TIMEOUT'].includes(state)) {
		setTimeout(() => {
			if (state === window.Store.AppState.state) {
				new Notification('WALC disconnected', {
					body: "Please check your connection.",
					icon: icon,
				});
			}
			renderTray();
		}, 5000);
	} else if (state === 'CONNECTED') {
		renderTray();
	}
}

function storeOnLoad() {
	if(icon instanceof Promise) {
		icon.then(() => storeOnLoad());
		return;
	}
	renderTray();
	window.Store.Chat.on('change:unreadCount', renderTray);
	window.Store.Chat.on('change:muteExpiration', renderTray);
	window.Store.AppState.on('change:state', appStateChange);
}

window.WALC = {
	load: () => ipcRenderer.send('loadWA'),
};

ipcRenderer.on('renderTray', renderTray);
ipcRenderer.on('storeOnLoad', storeOnLoad);
