import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useLiveRefetch, DIRECT_MESSAGE_EVENTS } from '../hooks/useLiveEvents';
import { ChatAttachmentCard, ChatMediaPreview } from '../components/messages/ChatMediaPreview';

const IMAGE_LIMIT = 10 * 1024 * 1024;
const PDF_LIMIT = 50 * 1024 * 1024;
const DESIGN_FILE_LIMIT = 50 * 1024 * 1024;
const MAX_ATTACHMENTS = 3;
const IMAGE_MIMES = ['image/jpeg', 'image/png', 'image/webp'];
const DESIGN_MIMES = ['image/svg+xml', 'application/vnd.adobe.illustrator', 'image/vnd.adobe.illustrator', 'application/postscript', 'image/vnd.adobe.photoshop', 'application/vnd.adobe.photoshop'];
const MIME_BY_EXTENSION = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', pdf: 'application/pdf', svg: 'image/svg+xml', ai: 'application/vnd.adobe.illustrator', psd: 'image/vnd.adobe.photoshop' };
const VERIFIED_NAMES = ['mohamed asharaf', 'abhinav'];
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
  if (IMAGE_MIMES.includes(mime) || mime === 'application/pdf' || DESIGN_MIMES.includes(mime)) return mime;
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

  const loadMessages = useCallback(async () => {
    if (!conversationId) return;
    try {
      const { data } = await api.get(`/messages/direct/conversations/${conversationId}/messages`);
      setSelected(data.conversation);
      setMessages(data.messages || []);
      setError('');
      await api.post(`/messages/direct/conversations/${conversationId}/read`, null, { silent: true });
    } catch (e) {
      setError(errorText(e));
    } finally {
      setLoading(false);
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
  }, [conversationId]);

  useEffect(() => { setDeleteMenuId(null); }, [activeMessageId]);

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

  useLiveRefetch(DIRECT_MESSAGE_EVENTS, () => {
    loadConversations().catch(() => {});
    if (conversationId) loadMessages();
  }, { delay: 200 });

  useEffect(() => {
    if (!conversationId) return undefined;
    const timer = setInterval(() => {
      if (!document.hidden) {
        api.post(`/messages/direct/conversations/${conversationId}/read`, null, { silent: true }).catch(() => {});
      }
    }, 45000);
    return () => clearInterval(timer);
  }, [conversationId]);

  useEffect(() => { tail.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }); }, [messages]);

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
  }, [conversationId, messages, error, replyTo, forwarding, emojiOpen]);

  const current = useMemo(() => conversations.find((c) => same(c.id, conversationId)), [conversations, conversationId]);
  const peer = selected?.peer || current?.peer;

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
        if (!image && !designFile && mime !== 'application/pdf') { setError('Attach JPG, PNG, WebP, SVG, AI, PSD, or PDF files.'); continue; }
        const limit = image && mime !== 'image/svg+xml' ? IMAGE_LIMIT : mime === 'application/pdf' ? PDF_LIMIT : DESIGN_FILE_LIMIT;
        if (file.size > limit) { setError(`${image && mime !== 'image/svg+xml' ? 'Images' : mime === 'application/pdf' ? 'PDF files' : 'SVG, AI, and PSD files'} must be ${limit / (1024 * 1024)} MB or smaller.`); continue; }
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

  const send = async (event) => {
    event.preventDefault();
    if (sending || (!draft.trim() && !files.length) || !conversationId) return;
    setSending(true);
    setError('');
    try {
      const attachments = [];
      for (const file of files) attachments.push(await upload(file));
      const { data } = await api.post(`/messages/direct/conversations/${conversationId}/messages`, { body: draft, attachments, reply_to_message_id: replyTo?.id || null });
      setMessages((old) => [...old, data.message]);
      setDraft('');
      setFiles([]);
      setReplyTo(null);
      await loadConversations();
      input.current?.focus();
    } catch (e) { setError(errorText(e) === 'Something went wrong. Please try again.' ? e.message : errorText(e)); }
    finally { setSending(false); }
  };

  const deleteMessage = async (message, mode) => {
    if (mode === 'for-everyone' && !window.confirm('Delete this message for everyone?')) return;
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
                  <span className="mt-0.5 flex items-center gap-1 truncate text-[11px] text-[color:var(--text-3)]"><Icon name="lock" className="h-3 w-3" /><span className="truncate">Only you and {peer?.name || 'this member'} can see this chat.</span></span>
                </span>
              </button>
            </header>

            <div ref={messageScroll} className="min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-contain bg-[var(--bg)] bg-[radial-gradient(45%_35%_at_100%_0%,var(--accent-light),transparent)] px-3 py-4 sm:px-5">
              <div ref={messageContent}>
                {error && <p role="alert" className="mb-3 rounded-xl border border-red-500/20 bg-red-500/10 px-3.5 py-2.5 text-sm text-red-600">{error}</p>}
                {loading ? <MessageSkeleton /> : !messages.length && !error ? (
                  <div className="grid place-items-center py-10 text-center">
                    <Avatar person={peer} className="h-14 w-14 text-lg" />
                    <p className="mt-3 text-sm font-semibold tracking-tight text-[color:var(--text)]">No messages yet</p>
                    <p className="mt-1 text-xs text-[color:var(--text-3)]">Say hello to {peer?.name || 'this member'}.</p>
                  </div>
                ) : messages.map((message) => {
                  const mine = same(message.sender_id, user?.id);
                  const menuOpen = same(deleteMenuId, message.id);
                  return (
                    <div key={message.id} className={`mb-3 flex ${mine ? 'justify-end' : 'justify-start'}`}>
                      <div onClick={() => setActiveMessageId((id) => (same(id, message.id) ? null : message.id))} className={`group relative max-w-[88%] px-3.5 py-2.5 sm:max-w-[68%] ${mine ? 'rounded-2xl rounded-br-md bg-[var(--accent)] text-white shadow-[0_10px_24px_-14px_var(--accent)]' : 'rounded-2xl rounded-bl-md border border-[color:var(--border)] bg-[var(--bg-2)] text-[color:var(--text)] shadow-[0_8px_20px_-16px_rgba(15,23,42,0.5)]'}`}>
                        {message.forwarded_from_id && <p className="mb-1 flex items-center gap-1 text-[10px] font-medium italic opacity-75"><Icon name="forward" className="h-3 w-3" />Forwarded</p>}
                        {message.reply_to_message_id && (
                          <div className={`mb-1.5 rounded-lg border-l-2 bg-black/10 px-2.5 py-1.5 text-[11px] ${mine ? 'border-white/60' : 'border-[color:var(--accent)]'}`}>
                            <span className="font-semibold">{message.reply_sender_name || 'Reply'}</span>
                            <p className="truncate opacity-80">{message.reply_body || 'Attachment'}</p>
                          </div>
                        )}
                        {message.deleted ? <p className="text-xs italic opacity-70">This message was deleted</p> : message.body && <p className="whitespace-pre-wrap break-words text-[13.5px] leading-relaxed">{message.body}</p>}
                        {!message.deleted && message.attachments?.map((file) => <ChatAttachmentCard key={file.public_id} file={file} onOpen={setPreviewAttachment} />)}
                        {!message.deleted && (
                          <div className={`${same(activeMessageId, message.id) ? 'mt-2 flex' : 'hidden'} items-center gap-0.5 whitespace-normal rounded-lg bg-black/10 p-0.5 md:absolute md:-top-4 ${mine ? 'md:right-2' : 'md:left-2'} md:z-10 md:mt-0 md:flex md:border md:border-[color:var(--border)] md:bg-[var(--bg-2)] md:text-[color:var(--text-2)] ${menuOpen ? 'md:opacity-100' : 'md:opacity-0'} md:shadow-[0_8px_20px_-12px_rgba(15,23,42,0.5)] md:transition-opacity md:duration-200 md:focus-within:opacity-100 md:group-hover:opacity-100`}>
                            <MessageAction icon="reply" title="Reply" onClick={() => { setReplyTo(message); input.current?.focus(); }} />
                            <MessageAction icon="forward" title="Forward" onClick={() => { setForwarding(message); setForwardTarget(''); }} />
                            <DeleteMenu
                              open={menuOpen}
                              mine={mine}
                              onToggle={() => setDeleteMenuId((id) => (same(id, message.id) ? null : message.id))}
                              onSelect={(mode) => { setDeleteMenuId(null); deleteMessage(message, mode); }}
                            />
                          </div>
                        )}
                        <p className={`mt-1 text-right text-[10px] tabular-nums ${mine ? 'text-white/70' : 'text-[color:var(--text-3)]'}`}>{labelTime(message.created_at)}</p>
                      </div>
                    </div>
                  );
                })}
                <div ref={tail} />
              </div>
            </div>

            <form onSubmit={send} className="shrink-0 border-t border-[color:var(--border)] bg-[var(--bg-2)] px-3 pb-2.5 pt-3 sm:px-5">
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
                <input ref={fileInput} type="file" multiple accept="image/jpeg,image/png,image/webp,image/svg+xml,application/pdf,.ai,.psd,.svg" onChange={chooseFiles} className="hidden" />
              <div className="flex items-end gap-1 rounded-2xl border border-[color:var(--border)] bg-[var(--bg-3)] p-1.5 transition duration-200 focus-within:border-[color:var(--accent)] focus-within:ring-4 focus-within:ring-[color:var(--accent-light)]">
                <button type="button" title="Attach image or PDF" aria-label="Attach image or PDF" onClick={() => fileInput.current?.click()} disabled={sending || files.length >= MAX_ATTACHMENTS} className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl text-[color:var(--text-2)] transition duration-200 hover:bg-[var(--bg-2)] hover:text-[color:var(--text)] active:scale-95 disabled:opacity-40 ${focusRing}`}><Icon name="clip" className="h-[18px] w-[18px]" /></button>
                <button type="button" title="Add emoji" aria-label="Add emoji" aria-pressed={emojiOpen} onClick={() => setEmojiOpen((v) => !v)} className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl transition duration-200 hover:bg-[var(--bg-2)] active:scale-95 ${focusRing} ${emojiOpen ? 'bg-[var(--bg-2)] text-[color:var(--accent)]' : 'text-[color:var(--text-2)]'}`}><Icon name="smile" className="h-[18px] w-[18px]" /></button>
                <textarea
                  ref={input}
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); send(e); } }}
                  maxLength={4000}
                  rows={Math.min(5, draft.split('\n').length)}
                  placeholder="Write a message"
                  aria-label="Write a message"
                  className="min-h-9 min-w-0 flex-1 resize-none bg-transparent px-1.5 py-2 text-sm leading-5 text-[color:var(--text)] outline-none placeholder:text-[color:var(--text-3)]"
                />
                <button type="submit" disabled={sending || (!draft.trim() && !files.length)} aria-label={sending ? 'Sending' : 'Send message'} className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[var(--accent)] text-white shadow-[0_8px_18px_-8px_var(--accent)] transition duration-200 hover:brightness-110 active:scale-95 disabled:opacity-40 disabled:shadow-none ${focusRing} ${sending ? 'animate-pulse' : ''}`}><Icon name="send" className="h-[18px] w-[18px]" /></button>
              </div>
              <p className="mt-1.5 truncate pl-1 text-[10px] text-[color:var(--text-3)]"><span className="sm:hidden">Images 10 MB · files 50 MB</span><span className="hidden sm:inline">Images up to 10 MB · PDFs, SVG, AI and PSD up to 50 MB · drag files here</span></p>
            </form>

            {dragging && (
              <div className="pointer-events-none absolute inset-3 z-20 grid place-items-center rounded-2xl border-2 border-dashed border-[color:var(--accent)] bg-[var(--bg-2)]" aria-hidden="true">
                <div className="flex items-center gap-2 rounded-xl bg-[var(--accent-light)] px-5 py-3 text-sm font-semibold text-[color:var(--accent)]"><Icon name="clip" className="h-4 w-4" />Drop images or PDFs to attach</div>
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
              <p className="mt-4 flex items-start gap-2 rounded-xl bg-[var(--bg-3)] px-3.5 py-3 text-xs leading-relaxed text-[color:var(--text-2)]"><Icon name="lock" className="mt-0.5 h-3.5 w-3.5" />Private chat between you and {peer.name || 'this member'}.</p>
              <button type="button" onClick={() => setProfileOpen(false)} className={`mt-5 w-full rounded-xl bg-[var(--accent)] px-4 py-2.5 text-sm font-semibold text-white shadow-[0_10px_22px_-10px_var(--accent)] transition duration-200 hover:brightness-110 active:scale-[0.98] ${focusRing}`}>Back to chat</button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
