// import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
// import { useNavigate, useParams } from 'react-router-dom';
// import api from '../api/client';
// import { useAuth } from '../context/AuthContext';
// import { useLiveRefetch, DIRECT_MESSAGE_EVENTS } from '../hooks/useLiveEvents';
// import { ChatAttachmentCard, ChatMediaPreview, PendingChatAttachment } from '../components/messages/ChatMediaPreview';

// const IMAGE_LIMIT = 10 * 1024 * 1024;
// const PDF_LIMIT = 100 * 1024 * 1024;
// const DESIGN_FILE_LIMIT = 100 * 1024 * 1024;
// const MAX_ATTACHMENTS = 3;
// const IMAGE_MIMES = ['image/jpeg', 'image/png', 'image/webp'];
// const DESIGN_MIMES = ['image/svg+xml', 'application/vnd.adobe.illustrator', 'image/vnd.adobe.illustrator', 'application/postscript', 'image/vnd.adobe.photoshop', 'application/vnd.adobe.photoshop'];
// const ZIP_MIMES = ['application/zip', 'application/x-zip-compressed'];
// const MIME_BY_EXTENSION = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', pdf: 'application/pdf', zip: 'application/zip', svg: 'image/svg+xml', ai: 'application/vnd.adobe.illustrator', psd: 'image/vnd.adobe.photoshop' };
// const VERIFIED_NAMES = ['mohamed asharaf', 'abhenav', 'abhinav', 'hari', 'kishor', 'subin','rahul','sanesh'];
// const isVerifiedName = (name) => {
//   const normalized = String(name || '').trim().toLowerCase().replace(/\s+/g, ' ');
//   return VERIFIED_NAMES.some((verifiedName) => normalized === verifiedName || normalized.startsWith(`${verifiedName} `));
// };
// function VerifiedBadge({ className = 'h-4 w-4' }) {
//   return (
//     <svg className={`inline-block shrink-0 ${className}`} viewBox="0 0 24 24" role="img" aria-label="Verified">
//       <title>Verified</title>
//       <rect x="4" y="4" width="16" height="16" rx="4.5" fill="#0095F6" />
//       <rect x="4" y="4" width="16" height="16" rx="4.5" fill="#0095F6" transform="rotate(45 12 12)" />
//       <path d="M8.1 12.4l2.6 2.6 5.3-5.5" fill="none" stroke="#fff" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" />
//     </svg>
//   );
// }
// const fileMime = (file) => {
//   const mime = String(file?.type || '').toLowerCase();
//   const extension = String(file?.name || '').split('.').pop().toLowerCase();
//   if (IMAGE_MIMES.includes(mime) || mime === 'application/pdf' || ZIP_MIMES.includes(mime) || DESIGN_MIMES.includes(mime)) return mime;
//   return MIME_BY_EXTENSION[extension] || mime;
// };
// const hasDraggedFiles = (event) => Array.from(event.dataTransfer?.types || []).includes('Files');
// const EMOJI_CATEGORIES = [
//   { name: 'Smileys', icon: '😀', emojis: '😀 😃 😄 😁 😆 😅 😂 🤣 🥲 ☺️ 😊 😇 🙂 🙃 😉 😌 😍 🥰 😘 😗 😙 😚 😋 😛 😝 😜 🤪 🤨 🧐 🤓 😎 🥸 🤩 🥳 😏 😒 😞 😔 😟 😕 🙁 ☹️ 😣 😖 😫 😩 🥺 😢 😭 😤 😠 😡 🤬 🤯 😳 🥵 🥶 😱 😨 😰 😥 😓 🤗 🤔 🫣 🤭 🫢 🫡 🤫 🫠 🤥 😶 😶‍🌫️ 😐 😑 😬 🫨 🙄 😯 😦 😧 😮 😲 🥱 😴 🤤 😪 😵 😵‍💫 🫥 🤐 🥴 🤢 🤮 🤧 😷 🤒 🤕 🤑 🤠 👻 💀 ☠️ 👽 👾 🤖 🎃 💩 👹 👺'.split(' ') },
//   { name: 'People', icon: '👋', emojis: '👋 🤚 🖐️ ✋ 🖖 🫱 🫲 🫳 🫴 🫷 🫸 👌 🤌 🤏 ✌️ 🤞 🫰 🤟 🤘 🤙 👈 👉 👆 🖕 👇 ☝️ 👍 👎 ✊ 👊 🤛 🤜 👏 🙌 🫶 👐 🤲 🙏 ✍️ 💅 🤳 💪 🦾 🦿 🦵 🦶 👂 🦻 👃 🧠 🫀 🫁 🦷 🦴 👀 👁️ 👅 👄 🫦 👶 🧒 👦 👧 🧑 👨 👩 🧔 👱‍♂️ 👱‍♀️ 🧓 👴 👵 🙍‍♂️ 🙍‍♀️ 🙎‍♂️ 🙎‍♀️ 🙅‍♂️ 🙅‍♀️ 🙆‍♂️ 🙆‍♀️ 💁‍♂️ 💁‍♀️ 🙋‍♂️ 🙋‍♀️ 🧏‍♂️ 🧏‍♀️ 🙇‍♂️ 🙇‍♀️ 🤦‍♂️ 🤦‍♀️ 🤷‍♂️ 🤷‍♀️ 🧑‍⚕️ 🧑‍🎓 🧑‍🏫 🧑‍⚖️ 🧑‍🌾 🧑‍🍳 🧑‍🔧 🧑‍💻 🧑‍🎤 🧑‍🎨 🧑‍✈️ 🧑‍🚀 🧑‍🚒 👮‍♂️ 👮‍♀️ 🕵️‍♂️ 🕵️‍♀️ 💂‍♂️ 💂‍♀️ 👷‍♂️ 👷‍♀️ 🤴 👸 👳‍♂️ 👳‍♀️ 🧕 🤵‍♂️ 🤵‍♀️ 👰‍♂️ 👰‍♀️ 🤰 🫃 🫄 🤱 👼 🎅 🤶 🧑‍🎄 🦸‍♂️ 🦸‍♀️ 🦹‍♂️ 🦹‍♀️ 🧙‍♂️ 🧙‍♀️ 🧚‍♂️ 🧚‍♀️ 🧛‍♂️ 🧛‍♀️ 🧜‍♂️ 🧜‍♀️ 🧝‍♂️ 🧝‍♀️ 🧞‍♂️ 🧞‍♀️ 🧟‍♂️ 🧟‍♀️ 💆‍♂️ 💆‍♀️ 💇‍♂️ 💇‍♀️ 🚶‍♂️ 🚶‍♀️ 🧍‍♂️ 🧍‍♀️ 🧎‍♂️ 🧎‍♀️ 🏃‍♂️ 🏃‍♀️ 💃 🕺 🕴️ 👯‍♂️ 👯‍♀️ 🧖‍♂️ 🧖‍♀️ 🧗‍♂️ 🧗‍♀️ 🏌️‍♂️ 🏌️‍♀️ 🏄‍♂️ 🏄‍♀️ 🚣‍♂️ 🚣‍♀️ 🏊‍♂️ 🏊‍♀️ 🧘‍♂️ 🧘‍♀️ 🛀 🛌 👭 👫 👬 💏 💑 👪 🗣️'.split(' ') },
//   { name: 'Animals & nature', icon: '🐻', emojis: '🐶 🐱 🐭 🐹 🐰 🦊 🐻 🐼 🐻‍❄️ 🐨 🐯 🦁 🐮 🐷 🐽 🐸 🐵 🙈 🙉 🙊 🐒 🐔 🐧 🐦 🐤 🐣 🐥 🦆 🦅 🦉 🦇 🐺 🐗 🐴 🦄 🫎 🫏 🐝 🪱 🐛 🦋 🐌 🐞 🐜 🪰 🪲 🪳 🦟 🦗 🕷️ 🕸️ 🦂 🐢 🐍 🦎 🦖 🦕 🐙 🦑 🦐 🦞 🦀 🪼 🐡 🐠 🐟 🐬 🐳 🐋 🦈 🐊 🐅 🐆 🦓 🫏 🦍 🦧 🦣 🐘 🦛 🦏 🐪 🐫 🦒 🦘 🦬 🐃 🐂 🐄 🐎 🐖 🐏 🐑 🦙 🐐 🦌 🐕 🦮 🐕‍🦺 🐩 🐈 🐈‍⬛ 🪶 🪽 🐓 🦃 🦤 🦚 🦜 🪽 🦢 🪿 🦩 🕊️ 🐇 🦝 🦨 🦡 🦫 🦦 🦥 🐁 🐀 🐿️ 🦔 🌵 🎄 🌲 🌳 🌴 🪵 🌱 🌿 ☘️ 🍀 🎍 🪴 🎋 🍃 🍂 🍁 🪺 🪹 🍄 🪾 🌾 💐 🌷 🪷 🌹 🥀 🌺 🌸 🪻 🌼 🌻 🌞 🌝 🌛 🌜 🌚 🌕 🌖 🌗 🌘 🌑 🌒 🌓 🌔 🌙 🌎 🌍 🌏 🪐 💫 ⭐ 🌟 ✨ ⚡ ☄️ 💥 🔥 🌪️ 🌈 ☀️ 🌤️ ⛅ 🌥️ ☁️ 🌦️ 🌧️ ⛈️ 🌩️ 🌨️ ❄️ ☃️ ⛄ 🌬️ 💨 💧 💦 ☔ ☂️ 🌊'.split(' ') },
//   { name: 'Food & drink', icon: '🍉', emojis: '🍏 🍎 🍐 🍊 🍋 🍌 🍉 🍇 🍓 🫐 🍈 🍒 🍑 🥭 🍍 🥥 🥝 🍅 🫒 🥑 🍆 🥔 🥕 🌽 🌶️ 🫑 🥒 🥬 🥦 🧄 🧅 🍄 🥜 🫘 🌰 🍞 🥐 🥖 🫓 🥨 🥯 🥞 🧇 🧀 🍖 🍗 🥩 🥓 🍔 🍟 🍕 🌭 🥪 🌮 🌯 🫔 🥙 🧆 🥚 🍳 🥘 🍲 🫕 🥣 🥗 🍿 🧈 🧂 🥫 🍱 🍘 🍙 🍚 🍛 🍜 🍝 🍠 🍢 🍣 🍤 🍥 🥮 🍡 🥟 🥠 🥡 🦪 🍦 🍧 🍨 🍩 🍪 🎂 🍰 🧁 🥧 🍫 🍬 🍭 🍮 🍯 🍼 🥛 ☕ 🫖 🍵 🍶 🍾 🍷 🍸 🍹 🍺 🍻 🥂 🥃 🫗 🥤 🧋 🧃 🧉 🧊 🥢 🍽️ 🍴 🥄'.split(' ') },
//   { name: 'Travel & places', icon: '🚗', emojis: '🚗 🚕 🚙 🚌 🚎 🏎️ 🚓 🚑 🚒 🚐 🛻 🚚 🚛 🚜 🏍️ 🛵 🚲 🛴 🛹 🛼 🚏 🛣️ 🛤️ 🛢️ ⛽ 🛞 🚨 🚥 🚦 🚧 ⚓ 🛟 ⛵ 🛶 🚤 🛳️ ⛴️ 🛥️ 🚢 ✈️ 🛩️ 🛫 🛬 🪂 💺 🚁 🚟 🚠 🚡 🚀 🛸 🛰️ 🧳 ⌛ ⏳ ⌚ ⏰ 🕰️ 🌍 🗺️ 🧭 🏔️ ⛰️ 🌋 🗻 🏕️ 🏖️ 🏜️ 🏝️ 🏞️ 🏟️ 🏛️ 🏗️ 🧱 🪨 🪵 🛖 🏘️ 🏚️ 🏠 🏡 🏢 🏣 🏤 🏥 🏦 🏨 🏩 🏪 🏫 🏬 🏭 🏯 🏰 💒 🗼 🗽 ⛪ 🕌 🛕 🕍 ⛩️ 🕋 ⛲ ⛺ 🌁 🌃 🏙️ 🌄 🌅 🌆 🌇 🌉 ♨️ 🎠 🛝 🎡 🎢 💈 🎪'.split(' ') },
//   { name: 'Activities', icon: '⚽', emojis: '⚽ 🏀 🏈 ⚾ 🥎 🎾 🏐 🏉 🥏 🎱 🪀 🏓 🏸 🏒 🏑 🥍 🏏 🏹 🪃 🥅 ⛳ 🪁 🏌️‍♂️ 🏌️‍♀️ 🏇 🛷 🥌 🎿 ⛷️ 🏂 🏋️‍♂️ 🏋️‍♀️ 🤼‍♂️ 🤼‍♀️ 🤸‍♂️ 🤸‍♀️ ⛹️‍♂️ ⛹️‍♀️ 🤺 🤾‍♂️ 🤾‍♀️ 🏌️‍♂️ 🏌️‍♀️ 🏄‍♂️ 🏄‍♀️ 🏊‍♂️ 🏊‍♀️ 🤽‍♂️ 🤽‍♀️ 🚣‍♂️ 🚣‍♀️ 🧗‍♂️ 🧗‍♀️ 🚵‍♂️ 🚵‍♀️ 🚴‍♂️ 🚴‍♀️ 🏆 🥇 🥈 🥉 🏅 🎖️ 🏵️ 🎗️ 🎫 🎟️ 🎪 🤹‍♂️ 🤹‍♀️ 🎭 🩰 🎨 🎬 🎤 🎧 🎼 🎹 🥁 🪘 🎷 🎺 🪗 🎸 🪕 🎻 🪈 🎲 ♟️ 🎯 🎳 🎮 🕹️ 🎰 🧩 🪅 🪩 🪆'.split(' ') },
//   { name: 'Objects', icon: '💡', emojis: '💌 💣 🪓 🔪 🗡️ ⚔️ 🛡️ 🚬 ⚰️ 🪦 ⚱️ 🏺 🔮 📿 🧿 🪬 💈 ⚗️ 🔭 🔬 🕳️ 🩹 🩺 💊 💉 🩸 🧬 🦠 🧫 🧪 🌡️ 🧹 🪠 🧺 🧻 🚽 🚰 🚿 🛁 🪥 🪒 🧽 🧴 🛎️ 🔑 🗝️ 🚪 🪑 🛋️ 🛏️ 🛌 🧸 🪆 🖼️ 🛍️ 🛒 🎁 🎈 🎏 🎀 🪄 🪅 🎊 🎉 🎎 🏮 🎐 🧧 ✉️ 📩 📨 📧 💌 📥 📤 📦 🏷️ 📪 📫 📬 📭 📮 📯 📜 📃 📄 📑 🧾 📊 📈 📉 📇 🗃️ 🗄️ 📋 📁 📂 🗂️ 🗞️ 📰 📓 📔 📒 📕 📗 📘 📙 📚 📖 🔖 🧷 🔗 📎 🖇️ 📐 📏 🧮 📌 📍 ✂️ 🖊️ 🖋️ ✒️ 🖌️ 🖍️ 📝 ✏️ 🔍 🔎 🔏 🔐 🔒 🔓 💻 🖥️ 🖨️ ⌨️ 🖱️ 🖲️ 💽 💾 💿 📀 🧮 📱 ☎️ 📞 📟 📠 🔋 🪫 🔌 💡 🔦 🕯️ 🪔 🔧 🪛 🔨 ⚒️ 🛠️ ⛏️ 🪚 🔩 ⚙️ 🪤 🧰 🪜 ⚖️ 🦯 🔗 ⛓️ 🪝 🧲 🪞 🪟 🧯 🛡️ 🚪 🧳 💎 🪙 💰 🪙 💸 💵 💴 💶 💷 💳 🧾'.split(' ') },
//   { name: 'Symbols', icon: '❤️', emojis: '❤️ 🩷 🧡 💛 💚 💙 🩵 💜 🤎 🖤 🩶 🤍 💔 ❤️‍🔥 ❤️‍🩹 💖 💗 💓 💞 💕 💘 💝 💟 ❣️ 💌 💋 💯 💢 💥 💫 💦 💨 🕳️ 💬 👁️‍🗨️ 🗨️ 🗯️ 💭 💤 💮 ♨️ 💈 🛑 🚫 ⛔ 📛 🚷 🚯 🚳 🚱 🔞 📵 ❌ ⭕ 🚭 🚮 🚰 🚹 🚺 🚻 🚼 🚾 ⚠️ 🚸 ⛽ ♿ 🚩 🎌 🔰 🔱 ✅ ☑️ ✔️ ❎ ✖️ ➕ ➖ ➗ ✳️ ✴️ ❇️ ‼️ ⁉️ ❓ ❔ ❕ ❗〰️ ➰ ➿ 〽️ ✨ 💱 💲 ⚕️ ♻️ ⚜️ 🔅 🔆 📶 📴 📳 🈶 🈚 🈸 🈺 🈷️ 🈹 🈯 🉐 🈲 🈵 🈴 🈳 🈂️ 🛂 🛃 🛄 🛅 🆚 🆓 🆕 🆖 🆗 🆘 🆙 🆔 🆒 🆓 🆙 🆗 🅰️ 🅱️ 🅾️ 🆎 🏧 🅿️ 🚾 🈁 🔣 🔤 🔡 🔠 🔢 #️⃣ *️⃣ 0️⃣ 1️⃣ 2️⃣ 3️⃣ 4️⃣ 5️⃣ 6️⃣ 7️⃣ 8️⃣ 9️⃣ 🔟 🔴 🟠 🟡 🟢 🔵 🟣 🟤 ⚫ ⚪ 🟥 🟧 🟨 🟩 🟦 🟪 🟫 ⬛ ⬜ ◼️ ◻️ 🔶 🔷 🔸 🔹 🔺 🔻 💠 🔘 🔳 🔲'.split(' ') },
//   { name: 'Flags', icon: '🏳️', emojis: '🏳️ 🏴 🏁 🚩 🏳️‍🌈 🏳️‍⚧️ 🏴‍☠️ 🇦🇫 🇦🇱 🇩🇿 🇦🇷 🇦🇺 🇦🇹 🇧🇩 🇧🇪 🇧🇷 🇨🇦 🇨🇳 🇨🇴 🇩🇰 🇪🇬 🇫🇮 🇫🇷 🇩🇪 🇬🇷 🇭🇰 🇮🇳 🇮🇩 🇮🇷 🇮🇶 🇮🇪 🇮🇱 🇮🇹 🇯🇵 🇰🇪 🇲🇾 🇲🇻 🇲🇽 🇳🇵 🇳🇱 🇳🇿 🇳🇬 🇳🇴 🇵🇰 🇵🇸 🇵🇭 🇵🇱 🇵🇹 🇶🇦 🇷🇺 🇸🇦 🇸🇬 🇿🇦 🇰🇷 🇪🇸 🇱🇰 🇸🇪 🇨🇭 🇹🇭 🇹🇷 🇺🇦 🇦🇪 🇬🇧 🇺🇸 🇻🇳'.split(' ') },
// ];
// const same = (a, b) => a != null && b != null && String(a) === String(b);
// const errorText = (e) => e?.response?.data?.error || 'Something went wrong. Please try again.';
// const labelTime = (v) => v ? new Intl.DateTimeFormat('en-IN', { hour: 'numeric', minute: '2-digit' }).format(new Date(v)) : '';

// /* ---------- WhatsApp-style date separators ---------- */

// const dayKey = (v) => { const d = new Date(v); return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`; };
// const labelDay = (v) => {
//   if (!v) return '';
//   const date = new Date(v);
//   const today = new Date(); today.setHours(0, 0, 0, 0);
//   const day = new Date(date); day.setHours(0, 0, 0, 0);
//   const diff = Math.round((today - day) / 86400000);
//   if (diff === 0) return 'Today';
//   if (diff === 1) return 'Yesterday';
//   if (diff > 1 && diff < 7) return new Intl.DateTimeFormat('en-IN', { weekday: 'long' }).format(date);
//   return new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'long', year: 'numeric' }).format(date);
// };

// const DateDivider = ({ label }) => (
//   <div className="pointer-events-none sticky top-0 z-10 my-3 flex justify-center">
//     <span className="rounded-lg border border-[color:var(--border)] bg-[var(--bg-2)]/95 px-3 py-1 text-[11px] font-medium text-[color:var(--text-2)] shadow-[0_6px_16px_-12px_rgba(15,23,42,0.5)] backdrop-blur">
//       {label}
//     </span>
//   </div>
// );

// /* ---------- Presentation helpers (no logic) ---------- */

// const ICONS = {
//   plus: ['M12 5v14M5 12h14'],
//   clip: ['m21 11-8.6 8.6a5 5 0 0 1-7.1-7.1l8.6-8.6a3.3 3.3 0 0 1 4.7 4.7l-8.6 8.6a1.7 1.7 0 0 1-2.4-2.4l7.9-7.9'],
//   smile: ['M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z', 'M8.5 14.2a4.5 4.5 0 0 0 7 0', 'M9 9.5h.01', 'M15 9.5h.01'],
//   send: ['M21 3 10.5 13.5', 'M21 3l-6.5 18-4-7.5L3 9.5 21 3Z'],
//   back: ['m15 18-6-6 6-6'],
//   lock: ['M6 11h12a1 1 0 0 1 1 1v7a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-7a1 1 0 0 1 1-1Z', 'M8 11V8a4 4 0 0 1 8 0v3'],
//   close: ['M6 6l12 12M18 6 6 18'],
//   reply: ['m9 14-5-5 5-5', 'M4 9h10a6 6 0 0 1 6 6v3'],
//   forward: ['m15 14 5-5-5-5', 'M20 9H10a6 6 0 0 0-6 6v3'],
//   trash: ['M4 7h16', 'M10 11v6M14 11v6', 'm6 7 1 12a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-12', 'M9 7V4h6v3'],
//   chat: ['M21 12a8 8 0 0 1-11.5 7.2L4 20l1.1-4.4A8 8 0 1 1 21 12Z'],
//   search: ['M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14Z', 'm20 20-3.5-3.5'],
//   file: ['M14 3H7a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V7l-4-4Z', 'M14 3v4h4'],
// };

// const Icon = ({ name, className = 'h-4 w-4' }) => (
//   <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className={`shrink-0 ${className}`} aria-hidden="true">
//     {ICONS[name].map((d) => <path key={d} d={d} />)}
//   </svg>
// );

// const Avatar = ({ person, className = 'h-10 w-10 text-sm' }) => (
//   person?.avatar_url
//     ? <img src={person.avatar_url} alt="" className={`${className} shrink-0 rounded-xl object-cover`} />
//     : <span className={`${className} grid shrink-0 place-items-center rounded-xl bg-[var(--accent-light)] font-semibold text-[color:var(--accent)]`}>{(person?.name || '?').slice(0, 1).toUpperCase()}</span>
// );

// const MessageAction = ({ icon, title, text, danger, onClick }) => (
//   <button type="button" title={title} aria-label={title} onClick={onClick} className={`inline-flex h-7 items-center gap-1 rounded-md px-1.5 text-[10px] font-medium transition duration-200 hover:bg-black/10 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-current ${danger ? 'md:hover:text-red-500' : ''}`}>
//     <Icon name={icon} className="h-3.5 w-3.5" />{text}
//   </button>
// );

// const DeleteMenu = ({ open, mine, onToggle, onSelect }) => (
//   <span className="relative inline-flex" data-delete-menu>
//     <button
//       type="button"
//       title="Delete"
//       aria-label="Delete message"
//       aria-haspopup="menu"
//       aria-expanded={open}
//       onClick={(e) => { e.stopPropagation(); onToggle(); }}
//       className={`inline-flex h-7 items-center gap-1 rounded-md px-1.5 text-[10px] font-medium transition duration-200 hover:bg-black/10 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-current md:hover:text-red-500 ${open ? 'bg-black/10 md:text-red-500' : ''}`}
//     >
//       <Icon name="trash" className="h-3.5 w-3.5" />
//     </button>
//     {open && (
//       <span
//         role="menu"
//         onClick={(e) => e.stopPropagation()}
//         className={`absolute bottom-full z-20 mb-1 w-52 overflow-hidden whitespace-normal rounded-xl border border-[color:var(--border)] bg-[var(--bg-2)] p-1 text-left text-[color:var(--text)] shadow-[0_18px_40px_-18px_rgba(15,23,42,0.55)] md:bottom-auto md:top-full md:mb-0 md:mt-1 ${mine ? 'right-0' : 'left-0'}`}
//       >
//         <button
//           type="button"
//           role="menuitem"
//           onClick={(e) => { e.stopPropagation(); onSelect('for-me'); }}
//           className="flex w-full items-start gap-2.5 rounded-lg px-2.5 py-2 text-left transition duration-150 hover:bg-[var(--bg-3)] active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--accent)]"
//         >
//           <Icon name="trash" className="mt-0.5 h-4 w-4 text-[color:var(--text-2)]" />
//           <span className="min-w-0">
//             <span className="block text-xs font-semibold">Delete for me</span>
//             <span className="block text-[10px] text-[color:var(--text-3)]">Removed only from your chat</span>
//           </span>
//         </button>
//         {mine && (
//           <button
//             type="button"
//             role="menuitem"
//             onClick={(e) => { e.stopPropagation(); onSelect('for-everyone'); }}
//             className="flex w-full items-start gap-2.5 rounded-lg px-2.5 py-2 text-left text-red-600 transition duration-150 hover:bg-red-500/10 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500"
//           >
//             <Icon name="trash" className="mt-0.5 h-4 w-4" />
//             <span className="min-w-0">
//               <span className="block text-xs font-semibold">Delete for everyone</span>
//               <span className="block text-[10px] opacity-70">Removed for both of you</span>
//             </span>
//           </button>
//         )}
//       </span>
//     )}
//   </span>
// );

// const ChatListSkeleton = () => (
//   <div className="space-y-1 p-1" aria-hidden="true">
//     {[0, 1, 2, 3].map((i) => (
//       <div key={i} className="flex animate-pulse items-center gap-3 rounded-xl px-3 py-3">
//         <span className="h-10 w-10 shrink-0 rounded-xl bg-[var(--bg-3)]" />
//         <span className="flex-1 space-y-2"><span className="block h-3 w-2/5 rounded bg-[var(--bg-3)]" /><span className="block h-2.5 w-4/5 rounded bg-[var(--bg-3)]" /></span>
//       </div>
//     ))}
//   </div>
// );

// const MessageSkeleton = () => (
//   <div className="space-y-3" aria-hidden="true">
//     {['w-3/5', 'w-2/5 ml-auto', 'w-1/2', 'w-2/3 ml-auto'].map((w, i) => <div key={i} className={`h-12 animate-pulse rounded-2xl bg-[var(--bg-3)] ${w}`} />)}
//   </div>
// );

// export default function DirectMessages() {
//   const { isManager, user } = useAuth();
//   const { conversationId } = useParams();
//   const navigate = useNavigate();
//   const [conversations, setConversations] = useState([]);
//   const [people, setPeople] = useState([]);
//   const [searchOpen, setSearchOpen] = useState(false);
//   const [search, setSearch] = useState('');
//   const [selected, setSelected] = useState(null);
//   const [messages, setMessages] = useState([]);
//   const [pendingUploads, setPendingUploads] = useState([]);
//   const [draft, setDraft] = useState('');
//   const [files, setFiles] = useState([]);
//   const [error, setError] = useState('');
//   const [loading, setLoading] = useState(true);
//   const [sending, setSending] = useState(false);
//   const [emojiOpen, setEmojiOpen] = useState(false);
//   const [emojiCategory, setEmojiCategory] = useState(0);
//   const [replyTo, setReplyTo] = useState(null);
//   const [forwarding, setForwarding] = useState(null);
//   const [forwardTarget, setForwardTarget] = useState('');
//   const [dragging, setDragging] = useState(false);
//   const [profileOpen, setProfileOpen] = useState(false);
//   const [previewAttachment, setPreviewAttachment] = useState(null);
//   const [activeMessageId, setActiveMessageId] = useState(null);
//   const [deleteMenuId, setDeleteMenuId] = useState(null);
//   const [deleteConfirmation, setDeleteConfirmation] = useState(null);
//   const tail = useRef(null);
//   const messageScroll = useRef(null);
//   const messageContent = useRef(null);
//   const [chatHeight, setChatHeight] = useState(null);
//   const dragDepth = useRef(0);
//   const fileInput = useRef(null);
//   const input = useRef(null);

//   const loadConversations = useCallback(async () => {
//     const { data } = await api.get('/messages/direct/conversations');
//     setConversations(data.conversations || []);
//   }, []);

//   const loadPeople = useCallback(async () => {
//     if (!searchOpen) return;
//     const { data } = await api.get('/messages/direct/members', { params: { search } });
//     setPeople(data.members || []);
//   }, [search, searchOpen]);

//   const loadMessages = useCallback(async () => {
//     if (!conversationId) return;
//     try {
//       const { data } = await api.get(`/messages/direct/conversations/${conversationId}/messages`);
//       setSelected(data.conversation);
//       setMessages(data.messages || []);
//       setError('');
//       await api.post(`/messages/direct/conversations/${conversationId}/read`, null, { silent: true });
//     } catch (e) {
//       setError(errorText(e));
//     } finally {
//       setLoading(false);
//     }
//   }, [conversationId]);

//   useEffect(() => {
//     let alive = true;
//     setLoading(true);
//     loadConversations().catch((e) => alive && setError(errorText(e))).finally(() => alive && setLoading(false));
//     return () => { alive = false; };
//   }, [loadConversations]);

//   useEffect(() => { loadPeople().catch((e) => setError(errorText(e))); }, [loadPeople]);
//   useEffect(() => {
//     if (conversationId) loadMessages();
//     else { setSelected(null); setMessages([]); setLoading(false); }
//   }, [conversationId, loadMessages]);

//   useEffect(() => {
//     setReplyTo(null);
//     setForwarding(null);
//     setForwardTarget('');
//     setActiveMessageId(null);
//     setDeleteMenuId(null);
//   }, [conversationId]);

//   useEffect(() => { setDeleteMenuId(null); }, [activeMessageId]);

//   useEffect(() => {
//     if (deleteMenuId == null) return undefined;
//     const onDown = (event) => { if (!event.target.closest?.('[data-delete-menu]')) setDeleteMenuId(null); };
//     const onKey = (event) => { if (event.key === 'Escape') setDeleteMenuId(null); };
//     document.addEventListener('mousedown', onDown);
//     document.addEventListener('keydown', onKey);
//     return () => {
//       document.removeEventListener('mousedown', onDown);
//       document.removeEventListener('keydown', onKey);
//     };
//   }, [deleteMenuId]);

//   useLiveRefetch(DIRECT_MESSAGE_EVENTS, () => {
//     loadConversations().catch(() => {});
//     if (conversationId) loadMessages();
//   }, { delay: 200 });

//   useEffect(() => {
//     if (!conversationId) return undefined;
//     const timer = setInterval(() => {
//       if (!document.hidden) {
//         api.post(`/messages/direct/conversations/${conversationId}/read`, null, { silent: true }).catch(() => {});
//       }
//     }, 45000);
//     return () => clearInterval(timer);
//   }, [conversationId]);

//   useEffect(() => { tail.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }); }, [messages]);

//   useEffect(() => {
//     if (!profileOpen) return undefined;
//     const onKey = (event) => { if (event.key === 'Escape') setProfileOpen(false); };
//     window.addEventListener('keydown', onKey);
//     return () => window.removeEventListener('keydown', onKey);
//   }, [profileOpen]);

//   useEffect(() => {
//     if (!conversationId) return undefined;
//     const resize = () => {
//       const viewport = window.innerHeight;
//       const mobile = window.innerWidth < 768;
//       const max = Math.max(320, Math.min(viewport * (mobile ? 0.88 : 0.78), viewport - (mobile ? 110 : 150)));
//       const min = Math.min(max, viewport * (mobile ? 0.68 : 0.72));
//       const contentHeight = messageContent.current?.scrollHeight || 0;
//       const fixedParts = mobile ? 176 : 190;
//       setChatHeight(Math.round(Math.min(max, Math.max(min, contentHeight + fixedParts))));
//     };
//     const frame = requestAnimationFrame(resize);
//     window.addEventListener('resize', resize);
//     return () => { cancelAnimationFrame(frame); window.removeEventListener('resize', resize); };
//   }, [conversationId, messages, error, replyTo, forwarding, emojiOpen]);

//   const current = useMemo(() => conversations.find((c) => same(c.id, conversationId)), [conversations, conversationId]);
//   const peer = selected?.peer || current?.peer;

//   const openConversation = useCallback(async (memberId) => {
//     setError('');
//     try {
//       const { data } = await api.post('/messages/direct/conversations', { member_id: memberId });
//       await loadConversations();
//       navigate(`/messages/people/${data.conversation.id}`);
//       setSearchOpen(false);
//       setSearch('');
//     } catch (e) { setError(errorText(e)); }
//   }, [loadConversations, navigate]);

//   const addFiles = (incomingFiles) => {
//     const incoming = Array.from(incomingFiles || []);
//     setError('');
//     setFiles((previous) => {
//       const next = [...previous];
//       for (const file of incoming) {
//         if (next.length >= MAX_ATTACHMENTS) { setError('A message can include up to 3 attachments.'); break; }
//         const mime = fileMime(file);
//         const image = IMAGE_MIMES.includes(mime) || mime === 'image/svg+xml';
//         const designFile = DESIGN_MIMES.includes(mime);
//         const zip = ZIP_MIMES.includes(mime);
//         if (!image && !designFile && mime !== 'application/pdf' && !zip) { setError('Attach JPG, PNG, WebP, SVG, AI, PSD, PDF, or ZIP files.'); continue; }
//         const limit = image && mime !== 'image/svg+xml' ? IMAGE_LIMIT : mime === 'application/pdf' ? PDF_LIMIT : DESIGN_FILE_LIMIT;
//         if (file.size > limit) { setError(`${image && mime !== 'image/svg+xml' ? 'Images' : zip ? 'ZIP files' : mime === 'application/pdf' ? 'PDF files' : 'SVG, AI, and PSD files'} must be ${limit / (1024 * 1024)} MB or smaller.`); continue; }
//         if (!next.some((item) => item.name === file.name && item.size === file.size)) next.push(file);
//       }
//       return next;
//     });
//   };

//   const chooseFiles = (event) => {
//     const incoming = Array.from(event.target.files || []);
//     event.target.value = '';
//     addFiles(incoming);
//   };

//   const onDragEnter = (event) => {
//     if (!hasDraggedFiles(event)) return;
//     event.preventDefault();
//     dragDepth.current += 1;
//     setDragging(true);
//   };

//   const onDragOver = (event) => {
//     if (!hasDraggedFiles(event)) return;
//     event.preventDefault();
//     event.dataTransfer.dropEffect = 'copy';
//   };

//   const onDragLeave = (event) => {
//     if (!hasDraggedFiles(event)) return;
//     dragDepth.current = Math.max(0, dragDepth.current - 1);
//     if (dragDepth.current === 0) setDragging(false);
//   };

//   const onDrop = (event) => {
//     if (!hasDraggedFiles(event)) return;
//     event.preventDefault();
//     dragDepth.current = 0;
//     setDragging(false);
//     addFiles(event.dataTransfer.files);
//   };

//   const upload = async (file) => {
//     const { data: signed } = await api.post('/messages/direct/uploads/signature', { mime_type: fileMime(file), size: file.size });
//     const form = new FormData();
//     for (const key of ['api_key', 'timestamp', 'signature', 'public_id', 'upload_preset']) if (signed[key] != null) form.append(key, String(signed[key]));
//     form.append('file', file);
//     const response = await fetch(signed.upload_url, { method: 'POST', body: form });
//     const result = await response.json();
//     if (!response.ok) throw new Error(result?.error?.message || 'Cloudinary upload failed.');
//     return {
//       public_id: result.public_id,
//       secure_url: result.secure_url,
//       resource_type: result.resource_type,
//       format: result.format,
//       bytes: result.bytes,
//       original_filename: file.name,
//     };
//   };

//   const send = async (event) => {
//     event.preventDefault();
//     if (sending || (!draft.trim() && !files.length) || !conversationId) return;
//     const body = draft.trim();
//     const outgoingFiles = [...files];
//     const pendingId = `pending-${Date.now()}`;
//     setSending(true);
//     setError('');
//     setPendingUploads((old) => [...old, { id: pendingId, conversationId, body, files: outgoingFiles, created_at: new Date().toISOString() }]);
//     setDraft('');
//     setFiles([]);
//     try {
//       const attachments = [];
//       for (const file of outgoingFiles) attachments.push(await upload(file));
//       const { data } = await api.post(`/messages/direct/conversations/${conversationId}/messages`, { body, attachments, reply_to_message_id: replyTo?.id || null });
//       setPendingUploads((old) => old.filter((item) => item.id !== pendingId));
//       setMessages((old) => [...old, data.message]);
//       setReplyTo(null);
//       await loadConversations();
//       input.current?.focus();
//     } catch (e) {
//       setPendingUploads((old) => old.filter((item) => item.id !== pendingId));
//       setFiles((old) => old.length ? old : outgoingFiles);
//       setDraft((old) => old || body);
//       setError(errorText(e) === 'Something went wrong. Please try again.' ? e.message : errorText(e));
//     }
//     finally { setSending(false); }
//   };

//   const deleteMessage = async (message, mode, confirmed = false) => {
//     if (mode === 'for-everyone' && !confirmed) {
//       setDeleteConfirmation(message);
//       return;
//     }
//     try {
//       await api.delete(`/messages/direct/conversations/${conversationId}/messages/${message.id}`, { data: { mode } });
//       if (mode === 'for-me') setMessages((old) => old.filter((item) => !same(item.id, message.id)));
//       else setMessages((old) => old.map((item) => same(item.id, message.id) ? { ...item, body: '', attachments: [], deleted: true } : item));
//       await loadConversations();
//     } catch (e) { setError(errorText(e)); }
//   };

//   const forwardMessage = async () => {
//     if (!forwarding || !forwardTarget) return;
//     try {
//       await api.post(`/messages/direct/conversations/${conversationId}/messages/${forwarding.id}/forward`, { target_conversation_id: forwardTarget });
//       setForwarding(null);
//       setForwardTarget('');
//       await loadConversations();
//     } catch (e) { setError(errorText(e)); }
//   };

//   const downloadUrl = (url) => String(url || '').replace('/upload/', '/upload/fl_attachment/');

//   if (isManager) return <div className="flex h-full items-center justify-center p-8 text-sm text-[color:var(--text-2)]">Member chats are available to members only.</div>;

//   const focusRing = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--accent)] focus-visible:ring-offset-1';
//   const pendingForChat = pendingUploads.filter((pending) => same(pending.conversationId, conversationId));
//   const showPendingToday = pendingForChat.length > 0 && (!messages.length || dayKey(messages[messages.length - 1].created_at) !== dayKey(new Date()));

//   return (
//     <div className="flex min-h-full min-w-0 items-start bg-[var(--bg)] md:p-5 lg:p-8">
//       <div
//         className={`mx-auto flex min-h-0 min-w-0 w-full max-w-[1400px] overflow-hidden bg-[var(--bg-2)] md:rounded-3xl md:border md:border-[color:var(--border)] md:shadow-[0_30px_70px_-35px_rgba(15,23,42,0.45)] ${conversationId ? '' : 'min-h-[calc(100dvh-150px)]'}`}
//         style={conversationId && chatHeight ? { height: `${chatHeight}px` } : undefined}
//       >
//         {/* ---------- Sidebar ---------- */}
//         <aside className={`${conversationId ? 'hidden md:flex' : 'flex'} w-full shrink-0 flex-col border-[color:var(--border)] md:w-[330px] md:border-r lg:w-[360px]`}>
//           <div className="flex items-center justify-between gap-3 px-4 pb-3 pt-4">
//             <div className="min-w-0">
//               <h1 className="text-[17px] font-semibold tracking-tight text-[color:var(--text)]">Member chats</h1>
//               <p className="mt-0.5 text-xs text-[color:var(--text-3)]">Private conversations between members</p>
//             </div>
//             <button
//               type="button"
//               onClick={() => { setSearchOpen((v) => !v); setError(''); }}
//               aria-expanded={searchOpen}
//               className={`inline-flex h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-xl bg-[var(--accent)] px-3 text-xs font-semibold text-white shadow-[0_8px_18px_-8px_var(--accent)] transition duration-200 hover:-translate-y-px hover:brightness-110 active:translate-y-0 active:scale-[0.97] ${focusRing}`}
//             >
//               <Icon name={searchOpen ? 'close' : 'plus'} className="h-3.5 w-3.5" />{searchOpen ? 'Close' : 'New chat'}
//             </button>
//           </div>

//           {searchOpen && (
//             <div className="border-b border-[color:var(--border)] px-4 pb-3">
//               <div className="relative">
//                 <Icon name="search" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[color:var(--text-3)]" />
//                 <input
//                   value={search}
//                   onChange={(e) => setSearch(e.target.value)}
//                   placeholder="Find a member"
//                   aria-label="Find a member"
//                   autoFocus
//                   className="h-10 w-full rounded-xl border border-[color:var(--border)] bg-[var(--bg-3)] pl-9 pr-3 text-sm text-[color:var(--text)] outline-none transition duration-200 placeholder:text-[color:var(--text-3)] focus:border-[color:var(--accent)] focus:ring-4 focus:ring-[color:var(--accent-light)]"
//                 />
//               </div>
//               <div className="mt-2 max-h-48 space-y-0.5 overflow-y-auto">
//                 {people.map((person) => (
//                   <button type="button" key={person.id} onClick={() => openConversation(person.id)} className={`flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left text-sm font-medium text-[color:var(--text)] transition duration-200 hover:bg-[var(--bg-3)] active:scale-[0.99] ${focusRing}`}>
//                     <Avatar person={person} className="h-8 w-8 text-xs" />
//                     <span className="flex min-w-0 items-center gap-1.5"><span className="truncate">{person.name}</span>{isVerifiedName(person.name) && <VerifiedBadge className="h-3.5 w-3.5" />}</span>
//                   </button>
//                 ))}
//                 {search.trim() && !people.length && <p className="px-2.5 py-3 text-xs text-[color:var(--text-3)]">No members match “{search.trim()}”.</p>}
//               </div>
//             </div>
//           )}

//           <nav aria-label="Conversations" className="min-h-0 flex-1 overflow-y-auto px-2 pb-3 pt-1">
//             <button type="button" onClick={() => navigate('/messages')} className={`mb-2 inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-[color:var(--text-2)] transition duration-200 hover:bg-[var(--bg-3)] hover:text-[color:var(--text)] ${focusRing}`}>
//               <Icon name="back" className="h-3.5 w-3.5" />Admin team messages
//             </button>
//             {loading ? <ChatListSkeleton /> : conversations.length ? conversations.map((c) => {
//               const active = same(c.id, conversationId);
//               return (
//                 <button
//                   key={c.id}
//                   type="button"
//                   onClick={() => navigate(`/messages/people/${c.id}`)}
//                   aria-current={active ? 'page' : undefined}
//                   className={`relative mb-0.5 flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition duration-200 hover:bg-[var(--bg-3)] active:scale-[0.99] ${focusRing} ${active ? 'bg-[var(--bg-3)] before:absolute before:bottom-3 before:left-0 before:top-3 before:w-[3px] before:rounded-full before:bg-[var(--accent)]' : ''}`}
//                 >
//                   <Avatar person={c.peer} className="h-10 w-10 text-sm" />
//                   <span className="min-w-0 flex-1">
//                     <span className={`flex min-w-0 items-center gap-1.5 text-sm tracking-tight text-[color:var(--text)] ${c.unread > 0 ? 'font-semibold' : 'font-medium'}`}><span className="truncate">{c.peer.name}</span>{isVerifiedName(c.peer.name) && <VerifiedBadge className="h-4 w-4" />}</span>
//                     <span className={`mt-0.5 block truncate text-xs ${c.unread > 0 ? 'text-[color:var(--text-2)]' : 'text-[color:var(--text-3)]'}`}>{c.last_message?.body || (c.last_message ? 'Attachment' : 'Start chatting')}</span>
//                   </span>
//                   {c.unread > 0 && <span className="min-w-[20px] rounded-md bg-[var(--accent)] px-1.5 py-0.5 text-center text-[10px] font-bold tabular-nums text-white">{c.unread}</span>}
//                 </button>
//               );
//             }) : (
//               <div className="mx-2 mt-6 rounded-2xl border border-dashed border-[color:var(--border)] px-5 py-8 text-center">
//                 <span className="mx-auto grid h-11 w-11 place-items-center rounded-xl bg-[var(--accent-light)] text-[color:var(--accent)]"><Icon name="chat" className="h-5 w-5" /></span>
//                 <p className="mt-3 text-sm font-semibold tracking-tight text-[color:var(--text)]">No member chats yet</p>
//                 <p className="mt-1 text-xs text-[color:var(--text-3)]">Use New chat to message a member.</p>
//               </div>
//             )}
//           </nav>
//         </aside>

//         {/* ---------- Conversation ---------- */}
//         <main className={`${conversationId ? 'flex' : 'hidden md:flex'} relative min-w-0 flex-1 flex-col md:border-l-0`} onDragEnter={onDragEnter} onDragOver={onDragOver} onDragLeave={onDragLeave} onDrop={onDrop}>
//           {!conversationId ? (
//             <div className="flex flex-1 flex-col items-center justify-center bg-[var(--bg)] px-6 text-center">
//               <span className="grid h-14 w-14 place-items-center rounded-2xl bg-[var(--accent-light)] text-[color:var(--accent)] shadow-[0_14px_30px_-16px_var(--accent)]"><Icon name="chat" className="h-6 w-6" /></span>
//               <h2 className="mt-4 text-lg font-semibold tracking-tight text-[color:var(--text)]">Your conversations</h2>
//               <p className="mt-1 max-w-xs text-sm text-[color:var(--text-3)]">Pick a member from the list or start a new chat.</p>
//             </div>
//           ) : <>
//             <header className="flex min-w-0 items-center gap-2 border-b border-[color:var(--border)] bg-[var(--bg-2)] px-3 py-3 sm:px-5">
//               <button type="button" onClick={() => navigate('/messages/people')} aria-label="Back to chats" className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl text-[color:var(--text-2)] transition duration-200 hover:bg-[var(--bg-3)] active:scale-95 md:hidden ${focusRing}`}>
//                 <Icon name="back" className="h-5 w-5" />
//               </button>
//               <button type="button" onClick={() => setProfileOpen(true)} aria-label={`View ${peer?.name || 'member'} profile`} className={`flex min-w-0 flex-1 items-center gap-3 rounded-xl p-1 text-left transition duration-200 hover:bg-[var(--bg-3)] ${focusRing}`}>
//                 <Avatar person={peer} className="h-10 w-10 text-sm" />
//                 <span className="min-w-0">
//                   <span className="flex min-w-0 items-center gap-1.5 text-sm font-semibold tracking-tight text-[color:var(--text)]"><span className="truncate">{peer?.name || 'Member'}</span>{isVerifiedName(peer?.name) && <VerifiedBadge className="h-4 w-4" />}</span>
//                   <span className="mt-0.5 flex items-center gap-1 truncate text-[11px] text-[color:var(--text-3)]"><Icon name="lock" className="h-3 w-3" /><span className="truncate">Only you and {peer?.name || 'this member'} can see this chat.</span></span>
//                 </span>
//               </button>
//             </header>

//             <div ref={messageScroll} className="min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-contain bg-[var(--bg)] bg-[radial-gradient(45%_35%_at_100%_0%,var(--accent-light),transparent)] px-3 py-4 sm:px-5">
//               <div ref={messageContent}>
//                 {error && <p role="alert" className="mb-3 rounded-xl border border-red-500/20 bg-red-500/10 px-3.5 py-2.5 text-sm text-red-600">{error}</p>}
//                 {loading ? <MessageSkeleton /> : !messages.length && !error ? (
//                   <div className="grid place-items-center py-10 text-center">
//                     <Avatar person={peer} className="h-14 w-14 text-lg" />
//                     <p className="mt-3 text-sm font-semibold tracking-tight text-[color:var(--text)]">No messages yet</p>
//                     <p className="mt-1 text-xs text-[color:var(--text-3)]">Say hello to {peer?.name || 'this member'}.</p>
//                   </div>
//                 ) : messages.map((message, index) => {
//                   const mine = same(message.sender_id, user?.id);
//                   const menuOpen = same(deleteMenuId, message.id);
//                   const showDate = index === 0 || dayKey(messages[index - 1].created_at) !== dayKey(message.created_at);
//                   return (
//                     <Fragment key={message.id}>
//                       {showDate && <DateDivider label={labelDay(message.created_at)} />}
//                       <div className={`mb-3 flex ${mine ? 'justify-end' : 'justify-start'}`}>
//                         <div onClick={() => setActiveMessageId((id) => (same(id, message.id) ? null : message.id))} className={`group relative max-w-[88%] px-3.5 py-2.5 sm:max-w-[68%] ${mine ? 'rounded-2xl rounded-br-md bg-[var(--accent)] text-white shadow-[0_10px_24px_-14px_var(--accent)]' : 'rounded-2xl rounded-bl-md border border-[color:var(--border)] bg-[var(--bg-2)] text-[color:var(--text)] shadow-[0_8px_20px_-16px_rgba(15,23,42,0.5)]'}`}>
//                           {message.forwarded_from_id && <p className="mb-1 flex items-center gap-1 text-[10px] font-medium italic opacity-75"><Icon name="forward" className="h-3 w-3" />Forwarded</p>}
//                           {message.reply_to_message_id && (
//                             <div className={`mb-1.5 rounded-lg border-l-2 bg-black/10 px-2.5 py-1.5 text-[11px] ${mine ? 'border-white/60' : 'border-[color:var(--accent)]'}`}>
//                               <span className="font-semibold">{message.reply_sender_name || 'Reply'}</span>
//                               <p className="truncate opacity-80">{message.reply_body || 'Attachment'}</p>
//                             </div>
//                           )}
//                           {message.deleted ? <p className="text-xs italic opacity-70">This message was deleted</p> : message.body && <p className="whitespace-pre-wrap break-words text-[13.5px] leading-relaxed">{message.body}</p>}
//                           {!message.deleted && message.attachments?.map((file) => <ChatAttachmentCard key={file.public_id} file={file} onOpen={setPreviewAttachment} />)}
//                           {!message.deleted && (
//                             <div className={`${same(activeMessageId, message.id) ? 'mt-2 flex' : 'hidden'} items-center gap-0.5 whitespace-normal rounded-lg bg-black/10 p-0.5 md:absolute md:-top-4 ${mine ? 'md:right-2' : 'md:left-2'} md:z-10 md:mt-0 md:flex md:border md:border-[color:var(--border)] md:bg-[var(--bg-2)] md:text-[color:var(--text-2)] ${menuOpen ? 'md:opacity-100' : 'md:opacity-0'} md:shadow-[0_8px_20px_-12px_rgba(15,23,42,0.5)] md:transition-opacity md:duration-200 md:focus-within:opacity-100 md:group-hover:opacity-100`}>
//                               <MessageAction icon="reply" title="Reply" onClick={() => { setReplyTo(message); input.current?.focus(); }} />
//                               <MessageAction icon="forward" title="Forward" onClick={() => { setForwarding(message); setForwardTarget(''); }} />
//                               <DeleteMenu
//                                 open={menuOpen}
//                                 mine={mine}
//                                 onToggle={() => setDeleteMenuId((id) => (same(id, message.id) ? null : message.id))}
//                                 onSelect={(mode) => { setDeleteMenuId(null); deleteMessage(message, mode); }}
//                               />
//                             </div>
//                           )}
//                           <p className={`mt-1 text-right text-[10px] tabular-nums ${mine ? 'text-white/70' : 'text-[color:var(--text-3)]'}`}>{labelTime(message.created_at)}</p>
//                         </div>
//                       </div>
//                     </Fragment>
//                   );
//                 })}
//                 {showPendingToday && <DateDivider label="Today" />}
//                 {pendingForChat.map((pending) => (
//                   <div key={pending.id} className="mb-3 flex justify-end">
//                     <div className="max-w-[88%] rounded-2xl rounded-br-md bg-[var(--accent)] px-3.5 py-2.5 text-white opacity-90 sm:max-w-[68%]">
//                       {pending.body && <p className="whitespace-pre-wrap break-words text-[13.5px] leading-relaxed">{pending.body}</p>}
//                       {pending.files.map((file, index) => <PendingChatAttachment key={`${pending.id}-${index}`} file={file} />)}
//                       <p className="mt-1 text-right text-[10px] text-white/70">Sending…</p>
//                     </div>
//                   </div>
//                 ))}
//                 <div ref={tail} />
//               </div>
//             </div>

//             <form onSubmit={send} className="shrink-0 border-t border-[color:var(--border)] bg-[var(--bg-2)] px-3 pb-2.5 pt-3 sm:px-5">
//               {replyTo && (
//                 <div className="mb-2 flex items-center justify-between gap-3 rounded-xl border-l-2 border-[color:var(--accent)] bg-[var(--accent-light)] px-3 py-2 text-xs text-[color:var(--text-2)]">
//                   <span className="truncate">Replying to: {replyTo.body || 'Attachment'}</span>
//                   <button type="button" onClick={() => setReplyTo(null)} aria-label="Cancel reply" className={`grid h-6 w-6 shrink-0 place-items-center rounded-md transition duration-200 hover:bg-black/10 ${focusRing}`}><Icon name="close" className="h-3.5 w-3.5" /></button>
//                 </div>
//               )}
//               {forwarding && (
//                 <div className="mb-2 flex flex-wrap items-center gap-2 rounded-xl bg-[var(--accent-light)] p-2.5">
//                   <span className="text-xs font-medium text-[color:var(--text-2)]">Forward to</span>
//                   <select value={forwardTarget} onChange={(e) => setForwardTarget(e.target.value)} className="min-w-0 flex-1 rounded-lg border border-[color:var(--border)] bg-[var(--bg-2)] px-2 py-1.5 text-xs text-[color:var(--text)] outline-none focus:border-[color:var(--accent)]">
//                     <option value="">Choose a chat</option>
//                     {conversations.filter((c) => !same(c.id, conversationId)).map((c) => <option key={c.id} value={c.id}>{c.peer.name}</option>)}
//                   </select>
//                   <button type="button" disabled={!forwardTarget} onClick={forwardMessage} className={`rounded-lg bg-[var(--accent)] px-3 py-1.5 text-xs font-semibold text-white transition duration-200 hover:brightness-110 active:scale-95 disabled:opacity-50 ${focusRing}`}>Forward</button>
//                   <button type="button" onClick={() => setForwarding(null)} className={`rounded-lg px-2 py-1.5 text-xs text-[color:var(--text-2)] transition duration-200 hover:bg-black/10 ${focusRing}`}>Cancel</button>
//                 </div>
//               )}
//               {files.length > 0 && (
//                 <div className="mb-2 flex flex-wrap gap-1.5">
//                   {files.map((file, index) => (
//                     <span key={`${file.name}-${index}`} className="flex max-w-64 items-center gap-1.5 rounded-lg border border-[color:var(--border)] bg-[var(--bg-3)] py-1 pl-2 pr-1 text-[11px] font-medium text-[color:var(--text-2)]">
//                       <Icon name="file" className="h-3.5 w-3.5" />
//                       <span className="truncate">{file.name}</span>
//                       <button type="button" aria-label={`Remove ${file.name}`} onClick={() => setFiles((old) => old.filter((_, i) => i !== index))} className={`grid h-5 w-5 place-items-center rounded-md transition duration-200 hover:bg-black/10 ${focusRing}`}><Icon name="close" className="h-3 w-3" /></button>
//                     </span>
//                   ))}
//                 </div>
//               )}
//               {emojiOpen && (
//                 <div className="mb-2 w-full min-w-0 rounded-2xl border border-[color:var(--border)] bg-[var(--bg-2)] p-2 shadow-[0_18px_40px_-24px_rgba(15,23,42,0.5)]">
//                   <div className="mb-1.5 flex min-w-0 flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
//                     <span className="px-1 text-[11px] font-semibold tracking-tight text-[color:var(--text-2)]">{EMOJI_CATEGORIES[emojiCategory].name}</span>
//                     <div className="flex w-full max-w-full gap-1 overflow-x-auto pb-1 sm:w-auto sm:max-w-[80%]">
//                       {EMOJI_CATEGORIES.map((category, index) => <button type="button" key={category.name} title={category.name} aria-label={category.name} aria-pressed={emojiCategory === index} onClick={() => setEmojiCategory(index)} className={`h-8 w-8 shrink-0 rounded-lg text-base transition duration-200 active:scale-90 ${emojiCategory === index ? 'bg-[var(--accent-light)]' : 'hover:bg-[var(--bg-3)]'}`}>{category.icon}</button>)}
//                     </div>
//                   </div>
//                   <div className="max-h-44 overflow-y-auto">
//                     <div className="grid grid-cols-7 gap-1 min-[360px]:grid-cols-8 sm:grid-cols-10 md:grid-cols-12">
//                       {EMOJI_CATEGORIES[emojiCategory].emojis.map((emoji, index) => <button type="button" key={`${emoji}-${index}`} aria-label={`Insert ${emoji}`} onClick={() => { setDraft((old) => `${old}${emoji}`); input.current?.focus(); }} className="grid h-8 w-full place-items-center rounded-lg text-lg transition duration-150 hover:scale-110 hover:bg-[var(--bg-3)] active:scale-95">{emoji}</button>)}
//                     </div>
//                   </div>
//                 </div>
//               )}
//                 <input ref={fileInput} type="file" multiple accept="image/jpeg,image/png,image/webp,image/svg+xml,application/pdf,application/zip,.ai,.psd,.svg,.zip" onChange={chooseFiles} className="hidden" />
//               <div className="flex items-end gap-1 rounded-2xl border border-[color:var(--border)] bg-[var(--bg-3)] p-1.5 transition duration-200 focus-within:border-[color:var(--accent)] focus-within:ring-4 focus-within:ring-[color:var(--accent-light)]">
//                 <button type="button" title="Attach a file" aria-label="Attach a file" onClick={() => fileInput.current?.click()} disabled={sending || files.length >= MAX_ATTACHMENTS} className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl text-[color:var(--text-2)] transition duration-200 hover:bg-[var(--bg-2)] hover:text-[color:var(--text)] active:scale-95 disabled:opacity-40 ${focusRing}`}><Icon name="clip" className="h-[18px] w-[18px]" /></button>
//                 <button type="button" title="Add emoji" aria-label="Add emoji" aria-pressed={emojiOpen} onClick={() => setEmojiOpen((v) => !v)} className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl transition duration-200 hover:bg-[var(--bg-2)] active:scale-95 ${focusRing} ${emojiOpen ? 'bg-[var(--bg-2)] text-[color:var(--accent)]' : 'text-[color:var(--text-2)]'}`}><Icon name="smile" className="h-[18px] w-[18px]" /></button>
//                 <textarea
//                   ref={input}
//                   value={draft}
//                   onChange={(e) => setDraft(e.target.value)}
//                   onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); send(e); } }}
//                   maxLength={4000}
//                   rows={Math.min(5, draft.split('\n').length)}
//                   placeholder="Write a message"
//                   aria-label="Write a message"
//                   className="min-h-9 min-w-0 flex-1 resize-none bg-transparent px-1.5 py-2 text-sm leading-5 text-[color:var(--text)] outline-none placeholder:text-[color:var(--text-3)]"
//                 />
//                 <button type="submit" disabled={sending || (!draft.trim() && !files.length)} aria-label={sending ? 'Sending' : 'Send message'} className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[var(--accent)] text-white shadow-[0_8px_18px_-8px_var(--accent)] transition duration-200 hover:brightness-110 active:scale-95 disabled:opacity-40 disabled:shadow-none ${focusRing} ${sending ? 'animate-pulse' : ''}`}><Icon name="send" className="h-[18px] w-[18px]" /></button>
//               </div>
//               <p className="mt-1.5 truncate pl-1 text-[10px] text-[color:var(--text-3)]"><span className="sm:hidden">Images 10 MB · files 100 MB</span><span className="hidden sm:inline">Images up to 10 MB · PDFs, SVG, AI, PSD and ZIP up to 100 MB · drag files here</span></p>
//             </form>

//             {dragging && (
//               <div className="pointer-events-none absolute inset-3 z-20 grid place-items-center rounded-2xl border-2 border-dashed border-[color:var(--accent)] bg-[var(--bg-2)]" aria-hidden="true">
//                 <div className="flex items-center gap-2 rounded-xl bg-[var(--accent-light)] px-5 py-3 text-sm font-semibold text-[color:var(--accent)]"><Icon name="clip" className="h-4 w-4" />Drop files to attach</div>
//               </div>
//             )}
//           </>}
//         </main>
//       </div>

//       <ChatMediaPreview file={previewAttachment} onClose={() => setPreviewAttachment(null)} />

//       {profileOpen && peer && (
//         <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setProfileOpen(false); }}>
//           <section role="dialog" aria-modal="true" aria-label={`${peer.name || 'Member'} profile`} className="w-full max-w-sm overflow-hidden rounded-3xl border border-[color:var(--border)] bg-[var(--bg-2)] shadow-[0_40px_90px_-30px_rgba(0,0,0,0.6)]">
//             <div className="relative grid min-h-56 place-items-center bg-[var(--bg-3)] bg-[radial-gradient(70%_80%_at_50%_0%,var(--accent-light),transparent)] p-6">
//               <button type="button" aria-label="Close profile" onClick={() => setProfileOpen(false)} className={`absolute right-3 top-3 grid h-9 w-9 place-items-center rounded-xl bg-black/35 text-white transition duration-200 hover:bg-black/50 active:scale-95 ${focusRing}`}><Icon name="close" className="h-4 w-4" /></button>
//               {peer.avatar_url
//                 ? <img src={peer.avatar_url} alt={`${peer.name || 'Member'} profile`} className="h-40 w-40 rounded-[2rem] object-cover shadow-[0_24px_50px_-20px_rgba(0,0,0,0.55)]" />
//                 : <span className="grid h-40 w-40 place-items-center rounded-[2rem] bg-[var(--accent-light)] text-5xl font-semibold text-[color:var(--accent)]">{(peer.name || '?').slice(0, 1).toUpperCase()}</span>}
//             </div>
//             <div className="p-6">
//               <h2 className="flex items-center gap-2 text-xl font-semibold tracking-tight text-[color:var(--text)]">{peer.name || 'Member'}{isVerifiedName(peer.name) && <VerifiedBadge className="h-5 w-5" />}</h2>
//               <p className="mt-1 text-sm text-[color:var(--text-3)]">Member · Orbit</p>
//               <p className="mt-4 text-[11px] font-semibold uppercase tracking-wide text-[color:var(--text-3)]">About</p>
//               <p className="mt-1 whitespace-pre-wrap break-words rounded-xl bg-[var(--bg-3)] px-3.5 py-3 text-sm leading-relaxed text-[color:var(--text-2)]">{peer.bio?.trim() || 'No description added yet.'}</p>
//               <p className="mt-3 flex items-start gap-2 text-xs leading-relaxed text-[color:var(--text-3)]"><Icon name="lock" className="mt-0.5 h-3.5 w-3.5 shrink-0" />Private chat between you and {peer.name || 'this member'}.</p>
//               <button type="button" onClick={() => setProfileOpen(false)} className={`mt-5 w-full rounded-xl bg-[var(--accent)] px-4 py-2.5 text-sm font-semibold text-white shadow-[0_10px_22px_-10px_var(--accent)] transition duration-200 hover:brightness-110 active:scale-[0.98] ${focusRing}`}>Back to chat</button>
//             </div>
//           </section>
//         </div>
//       )}

//       {deleteConfirmation && (
//         <div className="fixed inset-0 z-[110] grid place-items-center bg-black/55 p-4 backdrop-blur-sm" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setDeleteConfirmation(null); }}>
//           <section role="alertdialog" aria-modal="true" aria-labelledby="delete-message-title" aria-describedby="delete-message-description" className="w-full max-w-sm rounded-2xl border border-[color:var(--border)] bg-[var(--bg-2)] p-5 shadow-[0_30px_80px_-24px_rgba(0,0,0,0.55)]">
//             <h2 id="delete-message-title" className="text-base font-semibold text-[color:var(--text)]">Delete for everyone?</h2>
//             <p id="delete-message-description" className="mt-2 text-sm leading-relaxed text-[color:var(--text-2)]">This message will be removed for everyone in this chat.</p>
//             <div className="mt-5 flex justify-end gap-2">
//               <button type="button" onClick={() => setDeleteConfirmation(null)} className={`rounded-xl border border-[color:var(--border)] px-4 py-2 text-sm font-medium text-[color:var(--text-2)] hover:bg-[var(--bg-3)] ${focusRing}`}>Cancel</button>
//               <button type="button" onClick={() => { const message = deleteConfirmation; setDeleteConfirmation(null); deleteMessage(message, 'for-everyone', true); }} className={`rounded-xl bg-[var(--danger)] px-4 py-2 text-sm font-semibold text-white transition hover:brightness-110 active:scale-[0.98] ${focusRing}`}>Delete for everyone</button>
//             </div>
//           </section>
//         </div>
//       )}
//     </div>
//   );
// }



import { Fragment, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useLiveRefetch, DIRECT_THREAD_EVENTS, DIRECT_TYPING_EVENTS } from '../hooks/useLiveEvents';
import { ChatAttachmentCard, ChatMediaPreview, PendingChatAttachment } from '../components/messages/ChatMediaPreview';
import {
  ChatSearchBar, Highlight, ReactionChips, ReactionPicker, ReadTicks, TypingBubble, TypingDots,
  canEditMessage, toggleReaction, useTypingIndicator, useTypingSender,
} from '../components/messages/ChatExtras';

const IMAGE_LIMIT = 10 * 1024 * 1024;
const PDF_LIMIT = 100 * 1024 * 1024;
const DESIGN_FILE_LIMIT = 100 * 1024 * 1024;
const MAX_ATTACHMENTS = 3;
const IMAGE_MIMES = ['image/jpeg', 'image/png', 'image/webp'];
const DESIGN_MIMES = ['image/svg+xml', 'application/vnd.adobe.illustrator', 'image/vnd.adobe.illustrator', 'application/postscript', 'image/vnd.adobe.photoshop', 'application/vnd.adobe.photoshop'];
const ZIP_MIMES = ['application/zip', 'application/x-zip-compressed'];
const MIME_BY_EXTENSION = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', pdf: 'application/pdf', zip: 'application/zip', svg: 'image/svg+xml', ai: 'application/vnd.adobe.illustrator', psd: 'image/vnd.adobe.photoshop' };
const VERIFIED_NAMES = ['mohamed asharaf', 'abhenav', 'abhinav', 'hari', 'kishor', 'subin','rahul','sanesh'];
const isVerifiedName = (name) => {
  const normalized = String(name || '').trim().toLowerCase().replace(/\s+/g, ' ');
  return VERIFIED_NAMES.some((verifiedName) => normalized === verifiedName || normalized.startsWith(`${verifiedName} `));
};
function VerifiedBadge({ className = 'h-4 w-4' }) {
  return (
    <svg className={`inline-block shrink-0 ${className}`} viewBox="0 0 24 24" role="img" aria-label="Verified">
      <title>Verified</title>
      <rect x="4" y="4" width="16" height="16" rx="4.5" fill="#0095F6" />
      <rect x="4" y="4" width="16" height="16" rx="4.5" fill="#0095F6" transform="rotate(45 12 12)" />
      <path d="M8.1 12.4l2.6 2.6 5.3-5.5" fill="none" stroke="#fff" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
const fileMime = (file) => {
  const mime = String(file?.type || '').toLowerCase();
  const extension = String(file?.name || '').split('.').pop().toLowerCase();
  if (IMAGE_MIMES.includes(mime) || mime === 'application/pdf' || ZIP_MIMES.includes(mime) || DESIGN_MIMES.includes(mime)) return mime;
  return MIME_BY_EXTENSION[extension] || mime;
};
const hasDraggedFiles = (event) => Array.from(event.dataTransfer?.types || []).includes('Files');
const EMOJI_CATEGORIES = [
  { name: 'Smileys', icon: '😀', emojis: '😀 😃 😄 😁 😆 😅 😂 🤣 🥲 ☺️ 😊 😇 🙂 🙃 😉 😌 😍 🥰 😘 😗 😙 😚 😋 😛 😝 😜 🤪 🤨 🧐 🤓 😎 🥸 🤩 🥳 😏 😒 😞 😔 😟 😕 🙁 ☹️ 😣 😖 😫 😩 🥺 😢 😭 😤 😠 😡 🤬 🤯 😳 🥵 🥶 😱 😨 😰 😥 😓 🤗 🤔 🫣 🤭 🫢 🫡 🤫 🫠 🤥 😶 😶‍🌫️ 😐 😑 😬 🫨 🙄 😯 😦 😧 😮 😲 🥱 😴 🤤 😪 😵 😵‍💫 🫥 🤐 🥴 🤢 🤮 🤧 😷 🤒 🤕 🤑 🤠 👻 💀 ☠️ 👽 👾 🤖 🎃 💩 👹 👺'.split(' ') },
  { name: 'People', icon: '👋', emojis: '👋 🤚 🖐️ ✋ 🖖 🫱 🫲 🫳 🫴 🫷 🫸 👌 🤌 🤏 ✌️ 🤞 🫰 🤟 🤘 🤙 👈 👉 👆 🖕 👇 ☝️ 👍 👎 ✊ 👊 🤛 🤜 👏 🙌 🫶 👐 🤲 🙏 ✍️ 💅 🤳 💪 🦾 🦿 🦵 🦶 👂 🦻 👃 🧠 🫀 🫁 🦷 🦴 👀 👁️ 👅 👄 🫦 👶 🧒 👦 👧 🧑 👨 👩 🧔 👱‍♂️ 👱‍♀️ 🧓 👴 👵 🙍‍♂️ 🙍‍♀️ 🙎‍♂️ 🙎‍♀️ 🙅‍♂️ 🙅‍♀️ 🙆‍♂️ 🙆‍♀️ 💁‍♂️ 💁‍♀️ 🙋‍♂️ 🙋‍♀️ 🧏‍♂️ 🧏‍♀️ 🙇‍♂️ 🙇‍♀️ 🤦‍♂️ 🤦‍♀️ 🤷‍♂️ 🤷‍♀️ 🧑‍⚕️ 🧑‍🎓 🧑‍🏫 🧑‍⚖️ 🧑‍🌾 🧑‍🍳 🧑‍🔧 🧑‍💻 🧑‍🎤 🧑‍🎨 🧑‍✈️ 🧑‍🚀 🧑‍🚒 👮‍♂️ 👮‍♀️ 🕵️‍♂️ 🕵️‍♀️ 💂‍♂️ 💂‍♀️ 👷‍♂️ 👷‍♀️ 🤴 👸 👳‍♂️ 👳‍♀️ 🧕 🤵‍♂️ 🤵‍♀️ 👰‍♂️ 👰‍♀️ 🤰 🫃 🫄 🤱 👼 🎅 🤶 🧑‍🎄 🦸‍♂️ 🦸‍♀️ 🦹‍♂️ 🦹‍♀️ 🧙‍♂️ 🧙‍♀️ 🧚‍♂️ 🧚‍♀️ 🧛‍♂️ 🧛‍♀️ 🧜‍♂️ 🧜‍♀️ 🧝‍♂️ 🧝‍♀️ 🧞‍♂️ 🧞‍♀️ 🧟‍♂️ 🧟‍♀️ 💆‍♂️ 💆‍♀️ 💇‍♂️ 💇‍♀️ 🚶‍♂️ 🚶‍♀️ 🧍‍♂️ 🧍‍♀️ 🧎‍♂️ 🧎‍♀️ 🏃‍♂️ 🏃‍♀️ 💃 🕺 🕴️ 👯‍♂️ 👯‍♀️ 🧖‍♂️ 🧖‍♀️ 🧗‍♂️ 🧗‍♀️ 🏌️‍♂️ 🏌️‍♀️ 🏄‍♂️ 🏄‍♀️ 🚣‍♂️ 🚣‍♀️ 🏊‍♂️ 🏊‍♀️ 🧘‍♂️ 🧘‍♀️ 🛀 🛌 👭 👫 👬 💏 💑 👪 🗣️'.split(' ') },
  { name: 'Animals & nature', icon: '🐻', emojis: '🐶 🐱 🐭 🐹 🐰 🦊 🐻 🐼 🐻‍❄️ 🐨 🐯 🦁 🐮 🐷 🐽 🐸 🐵 🙈 🙉 🙊 🐒 🐔 🐧 🐦 🐤 🐣 🐥 🦆 🦅 🦉 🦇 🐺 🐗 🐴 🦄 🫎 🫏 🐝 🪱 🐛 🦋 🐌 🐞 🐜 🪰 🪲 🪳 🦟 🦗 🕷️ 🕸️ 🦂 🐢 🐍 🦎 🦖 🦕 🐙 🦑 🦐 🦞 🦀 🪼 🐡 🐠 🐟 🐬 🐳 🐋 🦈 🐊 🐅 🐆 🦓 🫏 🦍 🦧 🦣 🐘 🦛 🦏 🐪 🐫 🦒 🦘 🦬 🐃 🐂 🐄 🐎 🐖 🐏 🐑 🦙 🐐 🦌 🐕 🦮 🐕‍🦺 🐩 🐈 🐈‍⬛ 🪶 🪽 🐓 🦃 🦤 🦚 🦜 🪽 🦢 🪿 🦩 🕊️ 🐇 🦝 🦨 🦡 🦫 🦦 🦥 🐁 🐀 🐿️ 🦔 🌵 🎄 🌲 🌳 🌴 🪵 🌱 🌿 ☘️ 🍀 🎍 🪴 🎋 🍃 🍂 🍁 🪺 🪹 🍄 🪾 🌾 💐 🌷 🪷 🌹 🥀 🌺 🌸 🪻 🌼 🌻 🌞 🌝 🌛 🌜 🌚 🌕 🌖 🌗 🌘 🌑 🌒 🌓 🌔 🌙 🌎 🌍 🌏 🪐 💫 ⭐ 🌟 ✨ ⚡ ☄️ 💥 🔥 🌪️ 🌈 ☀️ 🌤️ ⛅ 🌥️ ☁️ 🌦️ 🌧️ ⛈️ 🌩️ 🌨️ ❄️ ☃️ ⛄ 🌬️ 💨 💧 💦 ☔ ☂️ 🌊'.split(' ') },
  { name: 'Food & drink', icon: '🍉', emojis: '🍏 🍎 🍐 🍊 🍋 🍌 🍉 🍇 🍓 🫐 🍈 🍒 🍑 🥭 🍍 🥥 🥝 🍅 🫒 🥑 🍆 🥔 🥕 🌽 🌶️ 🫑 🥒 🥬 🥦 🧄 🧅 🍄 🥜 🫘 🌰 🍞 🥐 🥖 🫓 🥨 🥯 🥞 🧇 🧀 🍖 🍗 🥩 🥓 🍔 🍟 🍕 🌭 🥪 🌮 🌯 🫔 🥙 🧆 🥚 🍳 🥘 🍲 🫕 🥣 🥗 🍿 🧈 🧂 🥫 🍱 🍘 🍙 🍚 🍛 🍜 🍝 🍠 🍢 🍣 🍤 🍥 🥮 🍡 🥟 🥠 🥡 🦪 🍦 🍧 🍨 🍩 🍪 🎂 🍰 🧁 🥧 🍫 🍬 🍭 🍮 🍯 🍼 🥛 ☕ 🫖 🍵 🍶 🍾 🍷 🍸 🍹 🍺 🍻 🥂 🥃 🫗 🥤 🧋 🧃 🧉 🧊 🥢 🍽️ 🍴 🥄'.split(' ') },
  { name: 'Travel & places', icon: '🚗', emojis: '🚗 🚕 🚙 🚌 🚎 🏎️ 🚓 🚑 🚒 🚐 🛻 🚚 🚛 🚜 🏍️ 🛵 🚲 🛴 🛹 🛼 🚏 🛣️ 🛤️ 🛢️ ⛽ 🛞 🚨 🚥 🚦 🚧 ⚓ 🛟 ⛵ 🛶 🚤 🛳️ ⛴️ 🛥️ 🚢 ✈️ 🛩️ 🛫 🛬 🪂 💺 🚁 🚟 🚠 🚡 🚀 🛸 🛰️ 🧳 ⌛ ⏳ ⌚ ⏰ 🕰️ 🌍 🗺️ 🧭 🏔️ ⛰️ 🌋 🗻 🏕️ 🏖️ 🏜️ 🏝️ 🏞️ 🏟️ 🏛️ 🏗️ 🧱 🪨 🪵 🛖 🏘️ 🏚️ 🏠 🏡 🏢 🏣 🏤 🏥 🏦 🏨 🏩 🏪 🏫 🏬 🏭 🏯 🏰 💒 🗼 🗽 ⛪ 🕌 🛕 🕍 ⛩️ 🕋 ⛲ ⛺ 🌁 🌃 🏙️ 🌄 🌅 🌆 🌇 🌉 ♨️ 🎠 🛝 🎡 🎢 💈 🎪'.split(' ') },
  { name: 'Activities', icon: '⚽', emojis: '⚽ 🏀 🏈 ⚾ 🥎 🎾 🏐 🏉 🥏 🎱 🪀 🏓 🏸 🏒 🏑 🥍 🏏 🏹 🪃 🥅 ⛳ 🪁 🏌️‍♂️ 🏌️‍♀️ 🏇 🛷 🥌 🎿 ⛷️ 🏂 🏋️‍♂️ 🏋️‍♀️ 🤼‍♂️ 🤼‍♀️ 🤸‍♂️ 🤸‍♀️ ⛹️‍♂️ ⛹️‍♀️ 🤺 🤾‍♂️ 🤾‍♀️ 🏌️‍♂️ 🏌️‍♀️ 🏄‍♂️ 🏄‍♀️ 🏊‍♂️ 🏊‍♀️ 🤽‍♂️ 🤽‍♀️ 🚣‍♂️ 🚣‍♀️ 🧗‍♂️ 🧗‍♀️ 🚵‍♂️ 🚵‍♀️ 🚴‍♂️ 🚴‍♀️ 🏆 🥇 🥈 🥉 🏅 🎖️ 🏵️ 🎗️ 🎫 🎟️ 🎪 🤹‍♂️ 🤹‍♀️ 🎭 🩰 🎨 🎬 🎤 🎧 🎼 🎹 🥁 🪘 🎷 🎺 🪗 🎸 🪕 🎻 🪈 🎲 ♟️ 🎯 🎳 🎮 🕹️ 🎰 🧩 🪅 🪩 🪆'.split(' ') },
  { name: 'Objects', icon: '💡', emojis: '💌 💣 🪓 🔪 🗡️ ⚔️ 🛡️ 🚬 ⚰️ 🪦 ⚱️ 🏺 🔮 📿 🧿 🪬 💈 ⚗️ 🔭 🔬 🕳️ 🩹 🩺 💊 💉 🩸 🧬 🦠 🧫 🧪 🌡️ 🧹 🪠 🧺 🧻 🚽 🚰 🚿 🛁 🪥 🪒 🧽 🧴 🛎️ 🔑 🗝️ 🚪 🪑 🛋️ 🛏️ 🛌 🧸 🪆 🖼️ 🛍️ 🛒 🎁 🎈 🎏 🎀 🪄 🪅 🎊 🎉 🎎 🏮 🎐 🧧 ✉️ 📩 📨 📧 💌 📥 📤 📦 🏷️ 📪 📫 📬 📭 📮 📯 📜 📃 📄 📑 🧾 📊 📈 📉 📇 🗃️ 🗄️ 📋 📁 📂 🗂️ 🗞️ 📰 📓 📔 📒 📕 📗 📘 📙 📚 📖 🔖 🧷 🔗 📎 🖇️ 📐 📏 🧮 📌 📍 ✂️ 🖊️ 🖋️ ✒️ 🖌️ 🖍️ 📝 ✏️ 🔍 🔎 🔏 🔐 🔒 🔓 💻 🖥️ 🖨️ ⌨️ 🖱️ 🖲️ 💽 💾 💿 📀 🧮 📱 ☎️ 📞 📟 📠 🔋 🪫 🔌 💡 🔦 🕯️ 🪔 🔧 🪛 🔨 ⚒️ 🛠️ ⛏️ 🪚 🔩 ⚙️ 🪤 🧰 🪜 ⚖️ 🦯 🔗 ⛓️ 🪝 🧲 🪞 🪟 🧯 🛡️ 🚪 🧳 💎 🪙 💰 🪙 💸 💵 💴 💶 💷 💳 🧾'.split(' ') },
  { name: 'Symbols', icon: '❤️', emojis: '❤️ 🩷 🧡 💛 💚 💙 🩵 💜 🤎 🖤 🩶 🤍 💔 ❤️‍🔥 ❤️‍🩹 💖 💗 💓 💞 💕 💘 💝 💟 ❣️ 💌 💋 💯 💢 💥 💫 💦 💨 🕳️ 💬 👁️‍🗨️ 🗨️ 🗯️ 💭 💤 💮 ♨️ 💈 🛑 🚫 ⛔ 📛 🚷 🚯 🚳 🚱 🔞 📵 ❌ ⭕ 🚭 🚮 🚰 🚹 🚺 🚻 🚼 🚾 ⚠️ 🚸 ⛽ ♿ 🚩 🎌 🔰 🔱 ✅ ☑️ ✔️ ❎ ✖️ ➕ ➖ ➗ ✳️ ✴️ ❇️ ‼️ ⁉️ ❓ ❔ ❕ ❗〰️ ➰ ➿ 〽️ ✨ 💱 💲 ⚕️ ♻️ ⚜️ 🔅 🔆 📶 📴 📳 🈶 🈚 🈸 🈺 🈷️ 🈹 🈯 🉐 🈲 🈵 🈴 🈳 🈂️ 🛂 🛃 🛄 🛅 🆚 🆓 🆕 🆖 🆗 🆘 🆙 🆔 🆒 🆓 🆙 🆗 🅰️ 🅱️ 🅾️ 🆎 🏧 🅿️ 🚾 🈁 🔣 🔤 🔡 🔠 🔢 #️⃣ *️⃣ 0️⃣ 1️⃣ 2️⃣ 3️⃣ 4️⃣ 5️⃣ 6️⃣ 7️⃣ 8️⃣ 9️⃣ 🔟 🔴 🟠 🟡 🟢 🔵 🟣 🟤 ⚫ ⚪ 🟥 🟧 🟨 🟩 🟦 🟪 🟫 ⬛ ⬜ ◼️ ◻️ 🔶 🔷 🔸 🔹 🔺 🔻 💠 🔘 🔳 🔲'.split(' ') },
  { name: 'Flags', icon: '🏳️', emojis: '🏳️ 🏴 🏁 🚩 🏳️‍🌈 🏳️‍⚧️ 🏴‍☠️ 🇦🇫 🇦🇱 🇩🇿 🇦🇷 🇦🇺 🇦🇹 🇧🇩 🇧🇪 🇧🇷 🇨🇦 🇨🇳 🇨🇴 🇩🇰 🇪🇬 🇫🇮 🇫🇷 🇩🇪 🇬🇷 🇭🇰 🇮🇳 🇮🇩 🇮🇷 🇮🇶 🇮🇪 🇮🇱 🇮🇹 🇯🇵 🇰🇪 🇲🇾 🇲🇻 🇲🇽 🇳🇵 🇳🇱 🇳🇿 🇳🇬 🇳🇴 🇵🇰 🇵🇸 🇵🇭 🇵🇱 🇵🇹 🇶🇦 🇷🇺 🇸🇦 🇸🇬 🇿🇦 🇰🇷 🇪🇸 🇱🇰 🇸🇪 🇨🇭 🇹🇭 🇹🇷 🇺🇦 🇦🇪 🇬🇧 🇺🇸 🇻🇳'.split(' ') },
];
const same = (a, b) => a != null && b != null && String(a) === String(b);
const errorText = (e) => e?.response?.data?.error || 'Something went wrong. Please try again.';
const labelTime = (v) => v ? new Intl.DateTimeFormat('en-IN', { hour: 'numeric', minute: '2-digit' }).format(new Date(v)) : '';
const PAGE_SIZE = 50;
const NEAR_BOTTOM_PX = 120;
const byTime = (a, b) => new Date(a.created_at) - new Date(b.created_at) || String(a.id).localeCompare(String(b.id), undefined, { numeric: true });
const isNearBottom = (el) => el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_BOTTOM_PX;

/* ---------- WhatsApp-style date separators ---------- */

const dayKey = (v) => { const d = new Date(v); return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`; };
const labelDay = (v) => {
  if (!v) return '';
  const date = new Date(v);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const day = new Date(date); day.setHours(0, 0, 0, 0);
  const diff = Math.round((today - day) / 86400000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  if (diff > 1 && diff < 7) return new Intl.DateTimeFormat('en-IN', { weekday: 'long' }).format(date);
  return new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'long', year: 'numeric' }).format(date);
};

const DateDivider = ({ label }) => (
  <div className="pointer-events-none sticky top-1 z-10 my-3 flex justify-center">
    <span className="rounded-lg border border-[color:var(--border)] bg-[var(--bg-2)] px-3 py-1 text-[11px] font-medium text-[color:var(--text-2)] shadow-[0_6px_16px_-10px_rgba(15,23,42,0.45)]">
      {label}
    </span>
  </div>
);

/* ---------- Presentation helpers (no logic) ---------- */

const ICONS = {
  plus: ['M12 5v14M5 12h14'],
  clip: ['m21 11-8.6 8.6a5 5 0 0 1-7.1-7.1l8.6-8.6a3.3 3.3 0 0 1 4.7 4.7l-8.6 8.6a1.7 1.7 0 0 1-2.4-2.4l7.9-7.9'],
  smile: ['M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z', 'M8.5 14.2a4.5 4.5 0 0 0 7 0', 'M9 9.5h.01', 'M15 9.5h.01'],
  send: ['M21 3 10.5 13.5', 'M21 3l-6.5 18-4-7.5L3 9.5 21 3Z'],
  back: ['m15 18-6-6 6-6'],
  lock: ['M6 11h12a1 1 0 0 1 1 1v7a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-7a1 1 0 0 1 1-1Z', 'M8 11V8a4 4 0 0 1 8 0v3'],
  close: ['M6 6l12 12M18 6 6 18'],
  reply: ['m9 14-5-5 5-5', 'M4 9h10a6 6 0 0 1 6 6v3'],
  forward: ['m15 14 5-5-5-5', 'M20 9H10a6 6 0 0 0-6 6v3'],
  trash: ['M4 7h16', 'M10 11v6M14 11v6', 'm6 7 1 12a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-12', 'M9 7V4h6v3'],
  chat: ['M21 12a8 8 0 0 1-11.5 7.2L4 20l1.1-4.4A8 8 0 1 1 21 12Z'],
  search: ['M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14Z', 'm20 20-3.5-3.5'],
  file: ['M14 3H7a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V7l-4-4Z', 'M14 3v4h4'],
  edit: ['M4 20h4L18.5 9.5a2.1 2.1 0 0 0-4-4L4 16v4Z', 'm13.5 6.5 4 4'],
};

const Icon = ({ name, className = 'h-4 w-4' }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className={`shrink-0 ${className}`} aria-hidden="true">
    {ICONS[name].map((d) => <path key={d} d={d} />)}
  </svg>
);

const Avatar = ({ person, className = 'h-10 w-10 text-sm' }) => (
  person?.avatar_url
    ? <img src={person.avatar_url} alt="" className={`${className} shrink-0 rounded-xl object-cover`} />
    : <span className={`${className} grid shrink-0 place-items-center rounded-xl bg-[var(--accent-light)] font-semibold text-[color:var(--accent)]`}>{(person?.name || '?').slice(0, 1).toUpperCase()}</span>
);

const MessageAction = ({ icon, title, text, danger, onClick }) => (
  <button type="button" title={title} aria-label={title} onClick={onClick} className={`inline-flex h-7 items-center gap-1 rounded-md px-1.5 text-[10px] font-medium transition duration-200 hover:bg-black/10 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-current ${danger ? 'md:hover:text-red-500' : ''}`}>
    <Icon name={icon} className="h-3.5 w-3.5" />{text}
  </button>
);

const DeleteMenu = ({ open, mine, onToggle, onSelect }) => (
  <span className="relative inline-flex" data-delete-menu>
    <button
      type="button"
      title="Delete"
      aria-label="Delete message"
      aria-haspopup="menu"
      aria-expanded={open}
      onClick={(e) => { e.stopPropagation(); onToggle(); }}
      className={`inline-flex h-7 items-center gap-1 rounded-md px-1.5 text-[10px] font-medium transition duration-200 hover:bg-black/10 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-current md:hover:text-red-500 ${open ? 'bg-black/10 md:text-red-500' : ''}`}
    >
      <Icon name="trash" className="h-3.5 w-3.5" />
    </button>
    {open && (
      <span
        role="menu"
        onClick={(e) => e.stopPropagation()}
        className={`absolute bottom-full z-20 mb-1 w-52 overflow-hidden whitespace-normal rounded-xl border border-[color:var(--border)] bg-[var(--bg-2)] p-1 text-left text-[color:var(--text)] shadow-[0_18px_40px_-18px_rgba(15,23,42,0.55)] md:bottom-auto md:top-full md:mb-0 md:mt-1 ${mine ? 'right-0' : 'left-0'}`}
      >
        <button
          type="button"
          role="menuitem"
          onClick={(e) => { e.stopPropagation(); onSelect('for-me'); }}
          className="flex w-full items-start gap-2.5 rounded-lg px-2.5 py-2 text-left transition duration-150 hover:bg-[var(--bg-3)] active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--accent)]"
        >
          <Icon name="trash" className="mt-0.5 h-4 w-4 text-[color:var(--text-2)]" />
          <span className="min-w-0">
            <span className="block text-xs font-semibold">Delete for me</span>
            <span className="block text-[10px] text-[color:var(--text-3)]">Removed only from your chat</span>
          </span>
        </button>
        {mine && (
          <button
            type="button"
            role="menuitem"
            onClick={(e) => { e.stopPropagation(); onSelect('for-everyone'); }}
            className="flex w-full items-start gap-2.5 rounded-lg px-2.5 py-2 text-left text-red-600 transition duration-150 hover:bg-red-500/10 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500"
          >
            <Icon name="trash" className="mt-0.5 h-4 w-4" />
            <span className="min-w-0">
              <span className="block text-xs font-semibold">Delete for everyone</span>
              <span className="block text-[10px] opacity-70">Removed for both of you</span>
            </span>
          </button>
        )}
      </span>
    )}
  </span>
);

const ChatListSkeleton = () => (
  <div className="space-y-1 p-1" aria-hidden="true">
    {[0, 1, 2, 3].map((i) => (
      <div key={i} className="flex animate-pulse items-center gap-3 rounded-xl px-3 py-3">
        <span className="h-10 w-10 shrink-0 rounded-xl bg-[var(--bg-3)]" />
        <span className="flex-1 space-y-2"><span className="block h-3 w-2/5 rounded bg-[var(--bg-3)]" /><span className="block h-2.5 w-4/5 rounded bg-[var(--bg-3)]" /></span>
      </div>
    ))}
  </div>
);

const MessageSkeleton = () => (
  <div className="space-y-3" aria-hidden="true">
    {['w-3/5', 'w-2/5 ml-auto', 'w-1/2', 'w-2/3 ml-auto'].map((w, i) => <div key={i} className={`h-12 animate-pulse rounded-2xl bg-[var(--bg-3)] ${w}`} />)}
  </div>
);

export default function DirectMessages() {
  const { isManager, user } = useAuth();
  const { conversationId } = useParams();
  const navigate = useNavigate();
  const [conversations, setConversations] = useState([]);
  const [people, setPeople] = useState([]);
  const [searchOpen, setSearchOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState(null);
  const [messages, setMessages] = useState([]);
  const [pendingUploads, setPendingUploads] = useState([]);
  const [draft, setDraft] = useState('');
  const [files, setFiles] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [emojiCategory, setEmojiCategory] = useState(0);
  const [replyTo, setReplyTo] = useState(null);
  const [forwarding, setForwarding] = useState(null);
  const [forwardTarget, setForwardTarget] = useState('');
  const [dragging, setDragging] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [previewAttachment, setPreviewAttachment] = useState(null);
  const [activeMessageId, setActiveMessageId] = useState(null);
  const [deleteMenuId, setDeleteMenuId] = useState(null);
  const [deleteConfirmation, setDeleteConfirmation] = useState(null);
  const [otherReadAt, setOtherReadAt] = useState(null);
  const [hasMore, setHasMore] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [editing, setEditing] = useState(null);
  const [reactPickerId, setReactPickerId] = useState(null);
  const [chatSearchOpen, setChatSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [flashId, setFlashId] = useState(null);
  const cidRef = useRef(conversationId);
  const messagesRef = useRef(messages);
  const stickRef = useRef(true); // keep the view pinned to the newest message
  const restoreRef = useRef(null); // scroll position to keep after loading older
  const lastIdRef = useRef(null);
  const olderBusyRef = useRef(false);
  cidRef.current = conversationId;
  messagesRef.current = messages;
  const tail = useRef(null);
  const messageScroll = useRef(null);
  const messageContent = useRef(null);
  const [chatHeight, setChatHeight] = useState(null);
  const dragDepth = useRef(0);
  const fileInput = useRef(null);
  const input = useRef(null);

  const loadConversations = useCallback(async () => {
    const { data } = await api.get('/messages/direct/conversations');
    setConversations(data.conversations || []);
  }, []);

  const loadPeople = useCallback(async () => {
    if (!searchOpen) return;
    const { data } = await api.get('/messages/direct/members', { params: { search } });
    setPeople(data.members || []);
  }, [search, searchOpen]);

  // Newest page. Older pages already on screen (loaded by scrolling up or
  // by search) are kept, so a live update never throws them away.
  const loadMessages = useCallback(async () => {
    if (!conversationId) return;
    const cid = conversationId;
    try {
      const { data } = await api.get(`/messages/direct/conversations/${cid}/messages`, { params: { limit: PAGE_SIZE } });
      if (String(cidRef.current) !== String(cid)) return;
      const page = data.messages || [];
      const older = page.length ? messagesRef.current.filter((m) => byTime(m, page[0]) < 0) : [];
      const next = page.length ? [...older, ...page] : [];
      messagesRef.current = next;
      setSelected(data.conversation);
      setMessages(next);
      if (!older.length) setHasMore(Boolean(data.has_more));
      setOtherReadAt(data.other_read_at || null);
      setError('');
      await api.post(`/messages/direct/conversations/${cid}/read`, null, { silent: true });
    } catch (e) {
      if (String(cidRef.current) === String(cid)) setError(errorText(e));
    } finally {
      if (String(cidRef.current) === String(cid)) setLoading(false);
    }
  }, [conversationId]);

  // One page older than the oldest message on screen. Returns how many came.
  const fetchOlderPage = useCallback(async () => {
    const first = messagesRef.current[0];
    if (!first || olderBusyRef.current) return 0;
    const cid = conversationId;
    olderBusyRef.current = true;
    setLoadingOlder(true);
    try {
      const { data } = await api.get(`/messages/direct/conversations/${cid}/messages`, { params: { before: first.id, limit: PAGE_SIZE } });
      if (String(cidRef.current) !== String(cid)) return 0;
      const ids = new Set(messagesRef.current.map((m) => String(m.id)));
      const older = (data.messages || []).filter((m) => !ids.has(String(m.id)));
      const el = messageScroll.current;
      if (el && older.length) restoreRef.current = { height: el.scrollHeight, top: el.scrollTop };
      const next = [...older, ...messagesRef.current];
      messagesRef.current = next;
      setMessages(next);
      setHasMore(Boolean(data.has_more));
      return older.length;
    } catch {
      return 0;
    } finally {
      olderBusyRef.current = false;
      setLoadingOlder(false);
    }
  }, [conversationId]);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    loadConversations().catch((e) => alive && setError(errorText(e))).finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, [loadConversations]);

  useEffect(() => { loadPeople().catch((e) => setError(errorText(e))); }, [loadPeople]);
  useEffect(() => {
    if (conversationId) loadMessages();
    else { setSelected(null); setMessages([]); setLoading(false); }
  }, [conversationId, loadMessages]);

  useEffect(() => {
    setReplyTo(null);
    setForwarding(null);
    setForwardTarget('');
    setActiveMessageId(null);
    setDeleteMenuId(null);
    setMessages([]);
    messagesRef.current = [];
    setHasMore(false);
    setOtherReadAt(null);
    setEditing(null);
    setReactPickerId(null);
    setChatSearchOpen(false);
    setSearchQuery('');
    setFlashId(null);
    stickRef.current = true;
    lastIdRef.current = null;
    if (conversationId) setLoading(true);
  }, [conversationId]);

  useEffect(() => { setDeleteMenuId(null); setReactPickerId(null); }, [activeMessageId]);

  // The reaction picker closes on a click outside it or on Escape.
  useEffect(() => {
    if (reactPickerId == null) return undefined;
    const onDown = (event) => { if (!event.target.closest?.('[data-react-picker]')) setReactPickerId(null); };
    const onKey = (event) => { if (event.key === 'Escape') setReactPickerId(null); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [reactPickerId]);

  useEffect(() => {
    if (deleteMenuId == null) return undefined;
    const onDown = (event) => { if (!event.target.closest?.('[data-delete-menu]')) setDeleteMenuId(null); };
    const onKey = (event) => { if (event.key === 'Escape') setDeleteMenuId(null); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [deleteMenuId]);

  useLiveRefetch(DIRECT_THREAD_EVENTS, () => {
    loadConversations().catch(() => {});
    if (conversationId) loadMessages();
  }, { delay: 200 });

  const typingUrl = conversationId ? `/messages/direct/conversations/${conversationId}/typing` : null;
  const { notify: notifyTyping, reset: resetTyping } = useTypingSender(typingUrl);
  const { typingIds, clear: clearTyping } = useTypingIndicator(DIRECT_TYPING_EVENTS, conversationId, user?.id);
  const peerTyping = typingIds.length > 0;

  useEffect(() => {
    if (!conversationId) return undefined;
    const timer = setInterval(() => {
      if (!document.hidden) {
        api.post(`/messages/direct/conversations/${conversationId}/read`, null, { silent: true }).catch(() => {});
      }
    }, 45000);
    return () => clearInterval(timer);
  }, [conversationId]);

  // Scroll: keep the position after loading older messages; otherwise follow
  // new messages while the view is at the bottom (or the new one is mine).
  useLayoutEffect(() => {
    const el = messageScroll.current;
    if (!el || loading) return; // the list is not on screen yet
    if (restoreRef.current) {
      const { height, top } = restoreRef.current;
      el.scrollTop = el.scrollHeight - height + top;
      restoreRef.current = null;
      return;
    }
    const last = messages[messages.length - 1];
    const lastId = last ? String(last.id) : null;
    const previous = lastIdRef.current;
    lastIdRef.current = lastId;
    if (!last || lastId === previous) return;
    if (!same(last.sender_id, user?.id)) clearTyping(last.sender_id);
    if (previous === null || stickRef.current || same(last.sender_id, user?.id)) {
      el.scrollTo({ top: el.scrollHeight, behavior: previous === null ? 'auto' : 'smooth' });
      stickRef.current = true;
    }
  }, [messages, loading, user?.id, clearTyping]);

  // A message being sent, or "typing…", appears at the bottom.
  useEffect(() => {
    const el = messageScroll.current;
    if (el && stickRef.current) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
  }, [pendingUploads.length, peerTyping]);

  const onMessagesScroll = (event) => {
    const el = event.currentTarget;
    stickRef.current = isNearBottom(el);
    if (el.scrollTop < 80 && hasMore && !loading && lastIdRef.current !== null) fetchOlderPage();
  };

  // Search: load older pages until the match is on screen, then flash it.
  const jumpTo = useCallback(async (result) => {
    if (!result) return;
    const cid = conversationId;
    stickRef.current = false;
    for (let guard = 0; guard < 40 && !messagesRef.current.some((m) => same(m.id, result.id)); guard += 1) {
      const loaded = await fetchOlderPage();
      if (!loaded || String(cidRef.current) !== String(cid)) break;
    }
    setFlashId({ id: String(result.id), at: Date.now() });
  }, [conversationId, fetchOlderPage]);

  useEffect(() => {
    if (!flashId) return undefined;
    const frame = requestAnimationFrame(() => {
      document.getElementById(`dm-msg-${flashId.id}`)?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    });
    const timer = setTimeout(() => setFlashId(null), 2200);
    return () => { cancelAnimationFrame(frame); clearTimeout(timer); };
  }, [flashId]);

  useEffect(() => {
    if (!profileOpen) return undefined;
    const onKey = (event) => { if (event.key === 'Escape') setProfileOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [profileOpen]);

  useEffect(() => {
    if (!conversationId) return undefined;
    const resize = () => {
      const viewport = window.innerHeight;
      const mobile = window.innerWidth < 768;
      const max = Math.max(320, Math.min(viewport * (mobile ? 0.88 : 0.78), viewport - (mobile ? 110 : 150)));
      const min = Math.min(max, viewport * (mobile ? 0.68 : 0.72));
      const contentHeight = messageContent.current?.scrollHeight || 0;
      const fixedParts = mobile ? 176 : 190;
      setChatHeight(Math.round(Math.min(max, Math.max(min, contentHeight + fixedParts))));
    };
    const frame = requestAnimationFrame(resize);
    window.addEventListener('resize', resize);
    return () => { cancelAnimationFrame(frame); window.removeEventListener('resize', resize); };
  }, [conversationId, messages, error, replyTo, forwarding, emojiOpen, editing, chatSearchOpen, peerTyping]);

  const current = useMemo(() => conversations.find((c) => same(c.id, conversationId)), [conversations, conversationId]);
  const peer = selected?.peer || current?.peer;

  // Group messages by calendar day so each day's chip only sticks while its own messages are on screen.
  const dayGroups = useMemo(() => {
    const groups = [];
    for (const message of messages) {
      const key = dayKey(message.created_at);
      const last = groups[groups.length - 1];
      if (last && last.key === key) last.items.push(message);
      else groups.push({ key, date: message.created_at, items: [message] });
    }
    return groups;
  }, [messages]);

  const openConversation = useCallback(async (memberId) => {
    setError('');
    try {
      const { data } = await api.post('/messages/direct/conversations', { member_id: memberId });
      await loadConversations();
      navigate(`/messages/people/${data.conversation.id}`);
      setSearchOpen(false);
      setSearch('');
    } catch (e) { setError(errorText(e)); }
  }, [loadConversations, navigate]);

  const addFiles = (incomingFiles) => {
    const incoming = Array.from(incomingFiles || []);
    setError('');
    setFiles((previous) => {
      const next = [...previous];
      for (const file of incoming) {
        if (next.length >= MAX_ATTACHMENTS) { setError('A message can include up to 3 attachments.'); break; }
        const mime = fileMime(file);
        const image = IMAGE_MIMES.includes(mime) || mime === 'image/svg+xml';
        const designFile = DESIGN_MIMES.includes(mime);
        const zip = ZIP_MIMES.includes(mime);
        if (!image && !designFile && mime !== 'application/pdf' && !zip) { setError('Attach JPG, PNG, WebP, SVG, AI, PSD, PDF, or ZIP files.'); continue; }
        const limit = image && mime !== 'image/svg+xml' ? IMAGE_LIMIT : mime === 'application/pdf' ? PDF_LIMIT : DESIGN_FILE_LIMIT;
        if (file.size > limit) { setError(`${image && mime !== 'image/svg+xml' ? 'Images' : zip ? 'ZIP files' : mime === 'application/pdf' ? 'PDF files' : 'SVG, AI, and PSD files'} must be ${limit / (1024 * 1024)} MB or smaller.`); continue; }
        if (!next.some((item) => item.name === file.name && item.size === file.size)) next.push(file);
      }
      return next;
    });
  };

  const chooseFiles = (event) => {
    const incoming = Array.from(event.target.files || []);
    event.target.value = '';
    addFiles(incoming);
  };

  const onDragEnter = (event) => {
    if (!hasDraggedFiles(event)) return;
    event.preventDefault();
    dragDepth.current += 1;
    setDragging(true);
  };

  const onDragOver = (event) => {
    if (!hasDraggedFiles(event)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
  };

  const onDragLeave = (event) => {
    if (!hasDraggedFiles(event)) return;
    dragDepth.current = Math.max(0, dragDepth.current - 1);
    if (dragDepth.current === 0) setDragging(false);
  };

  const onDrop = (event) => {
    if (!hasDraggedFiles(event)) return;
    event.preventDefault();
    dragDepth.current = 0;
    setDragging(false);
    addFiles(event.dataTransfer.files);
  };

  const upload = async (file) => {
    const { data: signed } = await api.post('/messages/direct/uploads/signature', { mime_type: fileMime(file), size: file.size });
    const form = new FormData();
    for (const key of ['api_key', 'timestamp', 'signature', 'public_id', 'upload_preset']) if (signed[key] != null) form.append(key, String(signed[key]));
    form.append('file', file);
    const response = await fetch(signed.upload_url, { method: 'POST', body: form });
    const result = await response.json();
    if (!response.ok) throw new Error(result?.error?.message || 'Cloudinary upload failed.');
    return {
      public_id: result.public_id,
      secure_url: result.secure_url,
      resource_type: result.resource_type,
      format: result.format,
      bytes: result.bytes,
      original_filename: file.name,
    };
  };

  const startEdit = (message) => {
    setEditing(message);
    setReplyTo(null);
    setForwarding(null);
    setActiveMessageId(null);
    setDraft(message.body || '');
    requestAnimationFrame(() => input.current?.focus());
  };

  const cancelEdit = () => {
    setEditing(null);
    setDraft('');
  };

  const saveEdit = async () => {
    const target = editing;
    const body = draft.trim();
    if (!target || (!body && !target.attachments?.length)) return;
    setSending(true);
    setError('');
    try {
      const { data } = await api.patch(`/messages/direct/conversations/${conversationId}/messages/${target.id}`, { body });
      setMessages((old) => old.map((m) => (same(m.id, target.id) ? { ...m, body: data.message?.body ?? body, edited_at: data.message?.edited_at || m.edited_at } : m)));
      setEditing(null);
      setDraft('');
      loadConversations().catch(() => {});
    } catch (e) {
      setError(errorText(e));
    } finally {
      setSending(false);
    }
  };

  // Same emoji again removes it. Shown at once, then confirmed by the server.
  const react = async (message, emoji) => {
    setReactPickerId(null);
    setActiveMessageId(null);
    setMessages((old) => old.map((m) => (same(m.id, message.id) ? { ...m, reactions: toggleReaction(m.reactions, user?.id, emoji) } : m)));
    try {
      const { data } = await api.post(`/messages/direct/conversations/${conversationId}/messages/${message.id}/reactions`, { emoji });
      setMessages((old) => old.map((m) => (same(m.id, message.id) ? { ...m, reactions: data.reactions || {} } : m)));
    } catch (e) {
      setError(errorText(e));
      loadMessages();
    }
  };

  const send = async (event) => {
    event.preventDefault();
    if (editing) { if (!sending) saveEdit(); return; }
    if (sending || (!draft.trim() && !files.length) || !conversationId) return;
    const body = draft.trim();
    const outgoingFiles = [...files];
    const pendingId = `pending-${Date.now()}`;
    setSending(true);
    setError('');
    setPendingUploads((old) => [...old, { id: pendingId, conversationId, body, files: outgoingFiles, created_at: new Date().toISOString() }]);
    setDraft('');
    setFiles([]);
    resetTyping();
    stickRef.current = true;
    try {
      const attachments = [];
      for (const file of outgoingFiles) attachments.push(await upload(file));
      const { data } = await api.post(`/messages/direct/conversations/${conversationId}/messages`, { body, attachments, reply_to_message_id: replyTo?.id || null });
      setPendingUploads((old) => old.filter((item) => item.id !== pendingId));
      setMessages((old) => (old.some((m) => same(m.id, data.message.id)) ? old : [...old, data.message]));
      setReplyTo(null);
      await loadConversations();
      input.current?.focus();
    } catch (e) {
      setPendingUploads((old) => old.filter((item) => item.id !== pendingId));
      setFiles((old) => old.length ? old : outgoingFiles);
      setDraft((old) => old || body);
      setError(errorText(e) === 'Something went wrong. Please try again.' ? e.message : errorText(e));
    }
    finally { setSending(false); }
  };

  const deleteMessage = async (message, mode, confirmed = false) => {
    if (mode === 'for-everyone' && !confirmed) {
      setDeleteConfirmation(message);
      return;
    }
    try {
      await api.delete(`/messages/direct/conversations/${conversationId}/messages/${message.id}`, { data: { mode } });
      if (mode === 'for-me') setMessages((old) => old.filter((item) => !same(item.id, message.id)));
      else setMessages((old) => old.map((item) => same(item.id, message.id) ? { ...item, body: '', attachments: [], deleted: true } : item));
      await loadConversations();
    } catch (e) { setError(errorText(e)); }
  };

  const forwardMessage = async () => {
    if (!forwarding || !forwardTarget) return;
    try {
      await api.post(`/messages/direct/conversations/${conversationId}/messages/${forwarding.id}/forward`, { target_conversation_id: forwardTarget });
      setForwarding(null);
      setForwardTarget('');
      await loadConversations();
    } catch (e) { setError(errorText(e)); }
  };

  const downloadUrl = (url) => String(url || '').replace('/upload/', '/upload/fl_attachment/');

  if (isManager) return <div className="flex h-full items-center justify-center p-8 text-sm text-[color:var(--text-2)]">Member chats are available to members only.</div>;

  const focusRing = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--accent)] focus-visible:ring-offset-1';
  const pendingForChat = pendingUploads.filter((pending) => same(pending.conversationId, conversationId));
  const pendingInLastGroup = dayGroups.length > 0 && dayGroups[dayGroups.length - 1].key === dayKey(new Date());
  const renderPending = (pending) => (
    <div key={pending.id} className="mb-3 flex justify-end">
      <div className="max-w-[88%] rounded-2xl rounded-br-md bg-[var(--accent)] px-3.5 py-2.5 text-white opacity-90 sm:max-w-[68%]">
        {pending.body && <p className="whitespace-pre-wrap break-words text-[13.5px] leading-relaxed">{pending.body}</p>}
        {pending.files.map((file, index) => <PendingChatAttachment key={`${pending.id}-${index}`} file={file} />)}
        <p className="mt-1 text-right text-[10px] text-white/70">Sending…</p>
      </div>
    </div>
  );

  return (
    <div className="flex min-h-full min-w-0 items-start bg-[var(--bg)] md:p-5 lg:p-8">
      <div
        className={`mx-auto flex min-h-0 min-w-0 w-full max-w-[1400px] overflow-hidden bg-[var(--bg-2)] md:rounded-3xl md:border md:border-[color:var(--border)] md:shadow-[0_30px_70px_-35px_rgba(15,23,42,0.45)] ${conversationId ? '' : 'min-h-[calc(100dvh-150px)]'}`}
        style={conversationId && chatHeight ? { height: `${chatHeight}px` } : undefined}
      >
        {/* ---------- Sidebar ---------- */}
        <aside className={`${conversationId ? 'hidden md:flex' : 'flex'} w-full shrink-0 flex-col border-[color:var(--border)] md:w-[330px] md:border-r lg:w-[360px]`}>
          <div className="flex items-center justify-between gap-3 px-4 pb-3 pt-4">
            <div className="min-w-0">
              <h1 className="text-[17px] font-semibold tracking-tight text-[color:var(--text)]">Member chats</h1>
              <p className="mt-0.5 text-xs text-[color:var(--text-3)]">Private conversations between members</p>
            </div>
            <button
              type="button"
              onClick={() => { setSearchOpen((v) => !v); setError(''); }}
              aria-expanded={searchOpen}
              className={`inline-flex h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-xl bg-[var(--accent)] px-3 text-xs font-semibold text-white shadow-[0_8px_18px_-8px_var(--accent)] transition duration-200 hover:-translate-y-px hover:brightness-110 active:translate-y-0 active:scale-[0.97] ${focusRing}`}
            >
              <Icon name={searchOpen ? 'close' : 'plus'} className="h-3.5 w-3.5" />{searchOpen ? 'Close' : 'New chat'}
            </button>
          </div>

          {searchOpen && (
            <div className="border-b border-[color:var(--border)] px-4 pb-3">
              <div className="relative">
                <Icon name="search" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[color:var(--text-3)]" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Find a member"
                  aria-label="Find a member"
                  autoFocus
                  className="h-10 w-full rounded-xl border border-[color:var(--border)] bg-[var(--bg-3)] pl-9 pr-3 text-sm text-[color:var(--text)] outline-none transition duration-200 placeholder:text-[color:var(--text-3)] focus:border-[color:var(--accent)] focus:ring-4 focus:ring-[color:var(--accent-light)]"
                />
              </div>
              <div className="mt-2 max-h-48 space-y-0.5 overflow-y-auto">
                {people.map((person) => (
                  <button type="button" key={person.id} onClick={() => openConversation(person.id)} className={`flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left text-sm font-medium text-[color:var(--text)] transition duration-200 hover:bg-[var(--bg-3)] active:scale-[0.99] ${focusRing}`}>
                    <Avatar person={person} className="h-8 w-8 text-xs" />
                    <span className="flex min-w-0 items-center gap-1.5"><span className="truncate">{person.name}</span>{isVerifiedName(person.name) && <VerifiedBadge className="h-3.5 w-3.5" />}</span>
                  </button>
                ))}
                {search.trim() && !people.length && <p className="px-2.5 py-3 text-xs text-[color:var(--text-3)]">No members match “{search.trim()}”.</p>}
              </div>
            </div>
          )}

          <nav aria-label="Conversations" className="min-h-0 flex-1 overflow-y-auto px-2 pb-3 pt-1">
            <button type="button" onClick={() => navigate('/messages')} className={`mb-2 inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-[color:var(--text-2)] transition duration-200 hover:bg-[var(--bg-3)] hover:text-[color:var(--text)] ${focusRing}`}>
              <Icon name="back" className="h-3.5 w-3.5" />Admin team messages
            </button>
            {loading ? <ChatListSkeleton /> : conversations.length ? conversations.map((c) => {
              const active = same(c.id, conversationId);
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => navigate(`/messages/people/${c.id}`)}
                  aria-current={active ? 'page' : undefined}
                  className={`relative mb-0.5 flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition duration-200 hover:bg-[var(--bg-3)] active:scale-[0.99] ${focusRing} ${active ? 'bg-[var(--bg-3)] before:absolute before:bottom-3 before:left-0 before:top-3 before:w-[3px] before:rounded-full before:bg-[var(--accent)]' : ''}`}
                >
                  <Avatar person={c.peer} className="h-10 w-10 text-sm" />
                  <span className="min-w-0 flex-1">
                    <span className={`flex min-w-0 items-center gap-1.5 text-sm tracking-tight text-[color:var(--text)] ${c.unread > 0 ? 'font-semibold' : 'font-medium'}`}><span className="truncate">{c.peer.name}</span>{isVerifiedName(c.peer.name) && <VerifiedBadge className="h-4 w-4" />}</span>
                    <span className={`mt-0.5 block truncate text-xs ${c.unread > 0 ? 'text-[color:var(--text-2)]' : 'text-[color:var(--text-3)]'}`}>{c.last_message?.body || (c.last_message ? 'Attachment' : 'Start chatting')}</span>
                  </span>
                  {c.unread > 0 && <span className="min-w-[20px] rounded-md bg-[var(--accent)] px-1.5 py-0.5 text-center text-[10px] font-bold tabular-nums text-white">{c.unread}</span>}
                </button>
              );
            }) : (
              <div className="mx-2 mt-6 rounded-2xl border border-dashed border-[color:var(--border)] px-5 py-8 text-center">
                <span className="mx-auto grid h-11 w-11 place-items-center rounded-xl bg-[var(--accent-light)] text-[color:var(--accent)]"><Icon name="chat" className="h-5 w-5" /></span>
                <p className="mt-3 text-sm font-semibold tracking-tight text-[color:var(--text)]">No member chats yet</p>
                <p className="mt-1 text-xs text-[color:var(--text-3)]">Use New chat to message a member.</p>
              </div>
            )}
          </nav>
        </aside>

        {/* ---------- Conversation ---------- */}
        <main className={`${conversationId ? 'flex' : 'hidden md:flex'} relative min-w-0 flex-1 flex-col md:border-l-0`} onDragEnter={onDragEnter} onDragOver={onDragOver} onDragLeave={onDragLeave} onDrop={onDrop}>
          {!conversationId ? (
            <div className="flex flex-1 flex-col items-center justify-center bg-[var(--bg)] px-6 text-center">
              <span className="grid h-14 w-14 place-items-center rounded-2xl bg-[var(--accent-light)] text-[color:var(--accent)] shadow-[0_14px_30px_-16px_var(--accent)]"><Icon name="chat" className="h-6 w-6" /></span>
              <h2 className="mt-4 text-lg font-semibold tracking-tight text-[color:var(--text)]">Your conversations</h2>
              <p className="mt-1 max-w-xs text-sm text-[color:var(--text-3)]">Pick a member from the list or start a new chat.</p>
            </div>
          ) : <>
            <header className="flex min-w-0 items-center gap-2 border-b border-[color:var(--border)] bg-[var(--bg-2)] px-3 py-3 sm:px-5">
              <button type="button" onClick={() => navigate('/messages/people')} aria-label="Back to chats" className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl text-[color:var(--text-2)] transition duration-200 hover:bg-[var(--bg-3)] active:scale-95 md:hidden ${focusRing}`}>
                <Icon name="back" className="h-5 w-5" />
              </button>
              <button type="button" onClick={() => setProfileOpen(true)} aria-label={`View ${peer?.name || 'member'} profile`} className={`flex min-w-0 flex-1 items-center gap-3 rounded-xl p-1 text-left transition duration-200 hover:bg-[var(--bg-3)] ${focusRing}`}>
                <Avatar person={peer} className="h-10 w-10 text-sm" />
                <span className="min-w-0">
                  <span className="flex min-w-0 items-center gap-1.5 text-sm font-semibold tracking-tight text-[color:var(--text)]"><span className="truncate">{peer?.name || 'Member'}</span>{isVerifiedName(peer?.name) && <VerifiedBadge className="h-4 w-4" />}</span>
                  {peerTyping ? (
                    <span className="mt-0.5 flex items-center gap-1.5 text-[11px] font-medium text-[color:var(--accent)]" aria-live="polite"><TypingDots />typing…</span>
                  ) : (
                    <span className="mt-0.5 flex items-center gap-1 truncate text-[11px] text-[color:var(--text-3)]"><Icon name="lock" className="h-3 w-3" /><span className="truncate">Only you and {peer?.name || 'this member'} can see this chat.</span></span>
                  )}
                </span>
              </button>
              <button
                type="button"
                onClick={() => { setChatSearchOpen((v) => !v); setSearchQuery(''); }}
                aria-label="Search this chat"
                aria-pressed={chatSearchOpen}
                title="Search this chat"
                className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl transition duration-200 hover:bg-[var(--bg-3)] hover:text-[color:var(--text)] active:scale-95 ${focusRing} ${chatSearchOpen ? 'bg-[var(--bg-3)] text-[color:var(--accent)]' : 'text-[color:var(--text-2)]'}`}
              >
                <Icon name="search" className="h-[18px] w-[18px]" />
              </button>
            </header>
            {chatSearchOpen && (
              <ChatSearchBar
                searchUrl={`/messages/direct/conversations/${conversationId}/search`}
                onClose={() => { setChatSearchOpen(false); setSearchQuery(''); }}
                onJump={jumpTo}
                onQueryChange={setSearchQuery}
              />
            )}

            <div ref={messageScroll} onScroll={onMessagesScroll} className="min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-contain bg-[var(--bg)] bg-[radial-gradient(45%_35%_at_100%_0%,var(--accent-light),transparent)] px-3 py-4 sm:px-5">
              <div ref={messageContent}>
                {error && <p role="alert" className="mb-3 rounded-xl border border-red-500/20 bg-red-500/10 px-3.5 py-2.5 text-sm text-red-600">{error}</p>}
                {hasMore && !loading && (
                  <div className="mb-2 flex justify-center">
                    <button type="button" onClick={fetchOlderPage} disabled={loadingOlder} className={`rounded-xl border border-[color:var(--border)] bg-[var(--bg-2)] px-3.5 py-1.5 text-xs font-semibold text-[color:var(--text-2)] transition duration-200 hover:text-[color:var(--text)] active:scale-[0.98] disabled:opacity-60 ${focusRing}`}>
                      {loadingOlder ? 'Loading…' : 'Load earlier messages'}
                    </button>
                  </div>
                )}
                {loading ? <MessageSkeleton /> : !messages.length && !error ? (
                  <div className="grid place-items-center py-10 text-center">
                    <Avatar person={peer} className="h-14 w-14 text-lg" />
                    <p className="mt-3 text-sm font-semibold tracking-tight text-[color:var(--text)]">No messages yet</p>
                    <p className="mt-1 text-xs text-[color:var(--text-3)]">Say hello to {peer?.name || 'this member'}.</p>
                  </div>
                ) : dayGroups.map((group, groupIndex) => (
                  <section key={group.key} className="relative">
                    <DateDivider label={labelDay(group.date)} />
                    {group.items.map((message) => {
                  const mine = same(message.sender_id, user?.id);
                  const menuOpen = same(deleteMenuId, message.id);
                  const pickerOpen = same(reactPickerId, message.id);
                  const seen = mine && otherReadAt && new Date(otherReadAt) >= new Date(message.created_at);
                  const flashing = same(flashId?.id, message.id);
                  return (
                    <Fragment key={message.id}>
                      <div id={`dm-msg-${message.id}`} className={`mb-3 flex scroll-mt-16 flex-col ${mine ? 'items-end' : 'items-start'}`}>
                        <div onClick={() => setActiveMessageId((id) => (same(id, message.id) ? null : message.id))} className={`group relative max-w-[88%] px-3.5 py-2.5 transition-shadow duration-300 sm:max-w-[68%] ${mine ? 'rounded-2xl rounded-br-md bg-[var(--accent)] text-white shadow-[0_10px_24px_-14px_var(--accent)]' : 'rounded-2xl rounded-bl-md border border-[color:var(--border)] bg-[var(--bg-2)] text-[color:var(--text)] shadow-[0_8px_20px_-16px_rgba(15,23,42,0.5)]'} ${flashing ? 'ring-2 ring-amber-400 ring-offset-2 ring-offset-[color:var(--bg)]' : ''}`}>
                          {message.forwarded_from_id && <p className="mb-1 flex items-center gap-1 text-[10px] font-medium italic opacity-75"><Icon name="forward" className="h-3 w-3" />Forwarded</p>}
                          {message.reply_to_message_id && (
                            <div className={`mb-1.5 rounded-lg border-l-2 bg-black/10 px-2.5 py-1.5 text-[11px] ${mine ? 'border-white/60' : 'border-[color:var(--accent)]'}`}>
                              <span className="font-semibold">{message.reply_sender_name || 'Reply'}</span>
                              <p className="truncate opacity-80">{message.reply_body || 'Attachment'}</p>
                            </div>
                          )}
                          {message.deleted ? <p className="text-xs italic opacity-70">This message was deleted</p> : message.body && <p className="whitespace-pre-wrap break-words text-[13.5px] leading-relaxed"><Highlight text={message.body} query={chatSearchOpen ? searchQuery : ''} /></p>}
                          {!message.deleted && message.attachments?.map((file) => <ChatAttachmentCard key={file.public_id} file={file} onOpen={setPreviewAttachment} />)}
                          {!message.deleted && (
                            <div data-react-picker className={`${same(activeMessageId, message.id) || pickerOpen ? 'mt-2 flex' : 'hidden'} items-center gap-0.5 whitespace-normal rounded-lg bg-black/10 p-0.5 md:absolute ${pickerOpen ? 'md:-top-9' : 'md:-top-4'} ${mine ? 'md:right-2' : 'md:left-2'} md:z-10 md:mt-0 md:flex md:border md:border-[color:var(--border)] md:bg-[var(--bg-2)] md:text-[color:var(--text-2)] ${menuOpen || pickerOpen ? 'md:opacity-100' : 'md:opacity-0'} md:shadow-[0_8px_20px_-12px_rgba(15,23,42,0.5)] md:transition-opacity md:duration-200 md:focus-within:opacity-100 md:group-hover:opacity-100`}>
                              {pickerOpen ? (
                                <ReactionPicker current={message.reactions?.[String(user?.id)]} onPick={(emoji) => react(message, emoji)} />
                              ) : (
                                <>
                                  <MessageAction icon="smile" title="React" onClick={(e) => { e.stopPropagation(); setDeleteMenuId(null); setReactPickerId(message.id); }} />
                                  <MessageAction icon="reply" title="Reply" onClick={() => { setEditing(null); setReplyTo(message); input.current?.focus(); }} />
                                  {canEditMessage(message, user?.id) && <MessageAction icon="edit" title="Edit" onClick={(e) => { e.stopPropagation(); startEdit(message); }} />}
                                  <MessageAction icon="forward" title="Forward" onClick={() => { setForwarding(message); setForwardTarget(''); }} />
                                  <DeleteMenu
                                    open={menuOpen}
                                    mine={mine}
                                    onToggle={() => setDeleteMenuId((id) => (same(id, message.id) ? null : message.id))}
                                    onSelect={(mode) => { setDeleteMenuId(null); deleteMessage(message, mode); }}
                                  />
                                </>
                              )}
                            </div>
                          )}
                          <p className={`mt-1 flex items-center justify-end gap-1 text-[10px] tabular-nums ${mine ? 'text-white/70' : 'text-[color:var(--text-3)]'}`}>
                            {message.edited_at && !message.deleted && <span className="italic" title={`Edited ${new Date(message.edited_at).toLocaleString('en-IN')}`}>edited</span>}
                            <span>{labelTime(message.created_at)}</span>
                            {mine && !message.deleted && <ReadTicks seen={seen} className={`h-3.5 w-3.5 ${seen ? 'text-sky-200' : ''}`} />}
                          </p>
                        </div>
                        {!message.deleted && (
                          <ReactionChips
                            reactions={message.reactions}
                            meId={user?.id}
                            nameOf={(id) => (same(id, peer?.id) ? peer?.name || 'Member' : 'Member')}
                            onToggle={(emoji) => react(message, emoji)}
                            alignEnd={mine}
                          />
                        )}
                      </div>
                    </Fragment>
                  );
                })}
                    {groupIndex === dayGroups.length - 1 && pendingInLastGroup && pendingForChat.map(renderPending)}
                  </section>
                ))}
                {!pendingInLastGroup && pendingForChat.length > 0 && (
                  <section className="relative">
                    <DateDivider label="Today" />
                    {pendingForChat.map(renderPending)}
                  </section>
                )}
                {peerTyping && !loading && <TypingBubble label={`${(peer?.name || 'Member').split(' ')[0]} is typing`} />}
                <div ref={tail} />
              </div>
            </div>

            <form onSubmit={send} className="shrink-0 border-t border-[color:var(--border)] bg-[var(--bg-2)] px-3 pb-2.5 pt-3 sm:px-5">
              {editing && (
                <div className="mb-2 flex items-center justify-between gap-3 rounded-xl border-l-2 border-amber-400 bg-amber-400/10 px-3 py-2 text-xs text-[color:var(--text-2)]">
                  <span className="flex min-w-0 items-center gap-1.5">
                    <Icon name="edit" className="h-3.5 w-3.5 text-amber-500" />
                    <span className="truncate"><span className="font-semibold text-[color:var(--text)]">Editing message</span> · {editing.body || 'Attachment'}</span>
                  </span>
                  <button type="button" onClick={cancelEdit} aria-label="Cancel editing" className={`grid h-6 w-6 shrink-0 place-items-center rounded-md transition duration-200 hover:bg-black/10 ${focusRing}`}><Icon name="close" className="h-3.5 w-3.5" /></button>
                </div>
              )}
              {replyTo && (
                <div className="mb-2 flex items-center justify-between gap-3 rounded-xl border-l-2 border-[color:var(--accent)] bg-[var(--accent-light)] px-3 py-2 text-xs text-[color:var(--text-2)]">
                  <span className="truncate">Replying to: {replyTo.body || 'Attachment'}</span>
                  <button type="button" onClick={() => setReplyTo(null)} aria-label="Cancel reply" className={`grid h-6 w-6 shrink-0 place-items-center rounded-md transition duration-200 hover:bg-black/10 ${focusRing}`}><Icon name="close" className="h-3.5 w-3.5" /></button>
                </div>
              )}
              {forwarding && (
                <div className="mb-2 flex flex-wrap items-center gap-2 rounded-xl bg-[var(--accent-light)] p-2.5">
                  <span className="text-xs font-medium text-[color:var(--text-2)]">Forward to</span>
                  <select value={forwardTarget} onChange={(e) => setForwardTarget(e.target.value)} className="min-w-0 flex-1 rounded-lg border border-[color:var(--border)] bg-[var(--bg-2)] px-2 py-1.5 text-xs text-[color:var(--text)] outline-none focus:border-[color:var(--accent)]">
                    <option value="">Choose a chat</option>
                    {conversations.filter((c) => !same(c.id, conversationId)).map((c) => <option key={c.id} value={c.id}>{c.peer.name}</option>)}
                  </select>
                  <button type="button" disabled={!forwardTarget} onClick={forwardMessage} className={`rounded-lg bg-[var(--accent)] px-3 py-1.5 text-xs font-semibold text-white transition duration-200 hover:brightness-110 active:scale-95 disabled:opacity-50 ${focusRing}`}>Forward</button>
                  <button type="button" onClick={() => setForwarding(null)} className={`rounded-lg px-2 py-1.5 text-xs text-[color:var(--text-2)] transition duration-200 hover:bg-black/10 ${focusRing}`}>Cancel</button>
                </div>
              )}
              {files.length > 0 && (
                <div className="mb-2 flex flex-wrap gap-1.5">
                  {files.map((file, index) => (
                    <span key={`${file.name}-${index}`} className="flex max-w-64 items-center gap-1.5 rounded-lg border border-[color:var(--border)] bg-[var(--bg-3)] py-1 pl-2 pr-1 text-[11px] font-medium text-[color:var(--text-2)]">
                      <Icon name="file" className="h-3.5 w-3.5" />
                      <span className="truncate">{file.name}</span>
                      <button type="button" aria-label={`Remove ${file.name}`} onClick={() => setFiles((old) => old.filter((_, i) => i !== index))} className={`grid h-5 w-5 place-items-center rounded-md transition duration-200 hover:bg-black/10 ${focusRing}`}><Icon name="close" className="h-3 w-3" /></button>
                    </span>
                  ))}
                </div>
              )}
              {emojiOpen && (
                <div className="mb-2 w-full min-w-0 rounded-2xl border border-[color:var(--border)] bg-[var(--bg-2)] p-2 shadow-[0_18px_40px_-24px_rgba(15,23,42,0.5)]">
                  <div className="mb-1.5 flex min-w-0 flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                    <span className="px-1 text-[11px] font-semibold tracking-tight text-[color:var(--text-2)]">{EMOJI_CATEGORIES[emojiCategory].name}</span>
                    <div className="flex w-full max-w-full gap-1 overflow-x-auto pb-1 sm:w-auto sm:max-w-[80%]">
                      {EMOJI_CATEGORIES.map((category, index) => <button type="button" key={category.name} title={category.name} aria-label={category.name} aria-pressed={emojiCategory === index} onClick={() => setEmojiCategory(index)} className={`h-8 w-8 shrink-0 rounded-lg text-base transition duration-200 active:scale-90 ${emojiCategory === index ? 'bg-[var(--accent-light)]' : 'hover:bg-[var(--bg-3)]'}`}>{category.icon}</button>)}
                    </div>
                  </div>
                  <div className="max-h-44 overflow-y-auto">
                    <div className="grid grid-cols-7 gap-1 min-[360px]:grid-cols-8 sm:grid-cols-10 md:grid-cols-12">
                      {EMOJI_CATEGORIES[emojiCategory].emojis.map((emoji, index) => <button type="button" key={`${emoji}-${index}`} aria-label={`Insert ${emoji}`} onClick={() => { setDraft((old) => `${old}${emoji}`); input.current?.focus(); }} className="grid h-8 w-full place-items-center rounded-lg text-lg transition duration-150 hover:scale-110 hover:bg-[var(--bg-3)] active:scale-95">{emoji}</button>)}
                    </div>
                  </div>
                </div>
              )}
                <input ref={fileInput} type="file" multiple accept="image/jpeg,image/png,image/webp,image/svg+xml,application/pdf,application/zip,.ai,.psd,.svg,.zip" onChange={chooseFiles} className="hidden" />
              <div className="flex items-end gap-1 rounded-2xl border border-[color:var(--border)] bg-[var(--bg-3)] p-1.5 transition duration-200 focus-within:border-[color:var(--accent)] focus-within:ring-4 focus-within:ring-[color:var(--accent-light)]">
                <button type="button" title="Attach a file" aria-label="Attach a file" onClick={() => fileInput.current?.click()} disabled={sending || Boolean(editing) || files.length >= MAX_ATTACHMENTS} className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl text-[color:var(--text-2)] transition duration-200 hover:bg-[var(--bg-2)] hover:text-[color:var(--text)] active:scale-95 disabled:opacity-40 ${focusRing}`}><Icon name="clip" className="h-[18px] w-[18px]" /></button>
                <button type="button" title="Add emoji" aria-label="Add emoji" aria-pressed={emojiOpen} onClick={() => setEmojiOpen((v) => !v)} className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl transition duration-200 hover:bg-[var(--bg-2)] active:scale-95 ${focusRing} ${emojiOpen ? 'bg-[var(--bg-2)] text-[color:var(--accent)]' : 'text-[color:var(--text-2)]'}`}><Icon name="smile" className="h-[18px] w-[18px]" /></button>
                <textarea
                  ref={input}
                  value={draft}
                  onChange={(e) => { setDraft(e.target.value); if (e.target.value.trim() && !editing) notifyTyping(); }}
                  onKeyDown={(e) => {
                    if (e.key === 'Escape' && editing) { e.preventDefault(); cancelEdit(); return; }
                    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); send(e); }
                  }}
                  maxLength={4000}
                  rows={Math.min(5, draft.split('\n').length)}
                  placeholder={editing ? 'Edit your message' : 'Write a message'}
                  aria-label={editing ? 'Edit your message' : 'Write a message'}
                  className="min-h-9 min-w-0 flex-1 resize-none bg-transparent px-1.5 py-2 text-sm leading-5 text-[color:var(--text)] outline-none placeholder:text-[color:var(--text-3)]"
                />
                <button type="submit" disabled={sending || (!draft.trim() && !files.length && !editing?.attachments?.length)} aria-label={sending ? 'Sending' : editing ? 'Save edit' : 'Send message'} className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[var(--accent)] text-white shadow-[0_8px_18px_-8px_var(--accent)] transition duration-200 hover:brightness-110 active:scale-95 disabled:opacity-40 disabled:shadow-none ${focusRing} ${sending ? 'animate-pulse' : ''}`}><Icon name="send" className="h-[18px] w-[18px]" /></button>
              </div>
              <p className="mt-1.5 truncate pl-1 text-[10px] text-[color:var(--text-3)]"><span className="sm:hidden">Images 10 MB · files 100 MB</span><span className="hidden sm:inline">Images up to 10 MB · PDFs, SVG, AI, PSD and ZIP up to 100 MB · drag files here</span></p>
            </form>

            {dragging && (
              <div className="pointer-events-none absolute inset-3 z-20 grid place-items-center rounded-2xl border-2 border-dashed border-[color:var(--accent)] bg-[var(--bg-2)]" aria-hidden="true">
                <div className="flex items-center gap-2 rounded-xl bg-[var(--accent-light)] px-5 py-3 text-sm font-semibold text-[color:var(--accent)]"><Icon name="clip" className="h-4 w-4" />Drop files to attach</div>
              </div>
            )}
          </>}
        </main>
      </div>

      <ChatMediaPreview file={previewAttachment} onClose={() => setPreviewAttachment(null)} />

      {profileOpen && peer && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setProfileOpen(false); }}>
          <section role="dialog" aria-modal="true" aria-label={`${peer.name || 'Member'} profile`} className="w-full max-w-sm overflow-hidden rounded-3xl border border-[color:var(--border)] bg-[var(--bg-2)] shadow-[0_40px_90px_-30px_rgba(0,0,0,0.6)]">
            <div className="relative grid min-h-56 place-items-center bg-[var(--bg-3)] bg-[radial-gradient(70%_80%_at_50%_0%,var(--accent-light),transparent)] p-6">
              <button type="button" aria-label="Close profile" onClick={() => setProfileOpen(false)} className={`absolute right-3 top-3 grid h-9 w-9 place-items-center rounded-xl bg-black/35 text-white transition duration-200 hover:bg-black/50 active:scale-95 ${focusRing}`}><Icon name="close" className="h-4 w-4" /></button>
              {peer.avatar_url
                ? <img src={peer.avatar_url} alt={`${peer.name || 'Member'} profile`} className="h-40 w-40 rounded-[2rem] object-cover shadow-[0_24px_50px_-20px_rgba(0,0,0,0.55)]" />
                : <span className="grid h-40 w-40 place-items-center rounded-[2rem] bg-[var(--accent-light)] text-5xl font-semibold text-[color:var(--accent)]">{(peer.name || '?').slice(0, 1).toUpperCase()}</span>}
            </div>
            <div className="p-6">
              <h2 className="flex items-center gap-2 text-xl font-semibold tracking-tight text-[color:var(--text)]">{peer.name || 'Member'}{isVerifiedName(peer.name) && <VerifiedBadge className="h-5 w-5" />}</h2>
              <p className="mt-1 text-sm text-[color:var(--text-3)]">Member · Orbit</p>
              <p className="mt-4 text-[11px] font-semibold uppercase tracking-wide text-[color:var(--text-3)]">About</p>
              <p className="mt-1 whitespace-pre-wrap break-words rounded-xl bg-[var(--bg-3)] px-3.5 py-3 text-sm leading-relaxed text-[color:var(--text-2)]">{peer.bio?.trim() || 'No description added yet.'}</p>
              <p className="mt-3 flex items-start gap-2 text-xs leading-relaxed text-[color:var(--text-3)]"><Icon name="lock" className="mt-0.5 h-3.5 w-3.5 shrink-0" />Private chat between you and {peer.name || 'this member'}.</p>
              <button type="button" onClick={() => setProfileOpen(false)} className={`mt-5 w-full rounded-xl bg-[var(--accent)] px-4 py-2.5 text-sm font-semibold text-white shadow-[0_10px_22px_-10px_var(--accent)] transition duration-200 hover:brightness-110 active:scale-[0.98] ${focusRing}`}>Back to chat</button>
            </div>
          </section>
        </div>
      )}

      {deleteConfirmation && (
        <div className="fixed inset-0 z-[110] grid place-items-center bg-black/55 p-4 backdrop-blur-sm" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setDeleteConfirmation(null); }}>
          <section role="alertdialog" aria-modal="true" aria-labelledby="delete-message-title" aria-describedby="delete-message-description" className="w-full max-w-sm rounded-2xl border border-[color:var(--border)] bg-[var(--bg-2)] p-5 shadow-[0_30px_80px_-24px_rgba(0,0,0,0.55)]">
            <h2 id="delete-message-title" className="text-base font-semibold text-[color:var(--text)]">Delete for everyone?</h2>
            <p id="delete-message-description" className="mt-2 text-sm leading-relaxed text-[color:var(--text-2)]">This message will be removed for everyone in this chat.</p>
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={() => setDeleteConfirmation(null)} className={`rounded-xl border border-[color:var(--border)] px-4 py-2 text-sm font-medium text-[color:var(--text-2)] hover:bg-[var(--bg-3)] ${focusRing}`}>Cancel</button>
              <button type="button" onClick={() => { const message = deleteConfirmation; setDeleteConfirmation(null); deleteMessage(message, 'for-everyone', true); }} className={`rounded-xl bg-[var(--danger)] px-4 py-2 text-sm font-semibold text-white transition hover:brightness-110 active:scale-[0.98] ${focusRing}`}>Delete for everyone</button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}