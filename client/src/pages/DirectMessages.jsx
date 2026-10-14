import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useLiveRefetch, DIRECT_MESSAGE_EVENTS } from '../hooks/useLiveEvents';

const IMAGE_LIMIT = 10 * 1024 * 1024;
const PDF_LIMIT = 50 * 1024 * 1024;
const MAX_ATTACHMENTS = 3;
const IMAGE_MIMES = ['image/jpeg', 'image/png', 'image/webp'];
const MIME_BY_EXTENSION = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', pdf: 'application/pdf' };
const fileMime = (file) => {
  const mime = String(file?.type || '').toLowerCase();
  if (IMAGE_MIMES.includes(mime) || mime === 'application/pdf') return mime;
  const extension = String(file?.name || '').split('.').pop().toLowerCase();
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
  const [dragging, setDragging] = useState(false);
  const tail = useRef(null);
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
        const image = IMAGE_MIMES.includes(mime);
        if (!image && mime !== 'application/pdf') { setError('Only JPG, PNG, WebP images and PDF files can be attached.'); continue; }
        if (file.size > (image ? IMAGE_LIMIT : PDF_LIMIT)) { setError(image ? 'Images must be 10 MB or smaller.' : 'PDF files must be 50 MB or smaller.'); continue; }
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
    for (const key of ['api_key', 'timestamp', 'signature', 'public_id', 'upload_preset']) form.append(key, String(signed[key]));
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
      const { data } = await api.post(`/messages/direct/conversations/${conversationId}/messages`, { body: draft, attachments });
      setMessages((old) => [...old, data.message]);
      setDraft('');
      setFiles([]);
      await loadConversations();
      input.current?.focus();
    } catch (e) { setError(errorText(e) === 'Something went wrong. Please try again.' ? e.message : errorText(e)); }
    finally { setSending(false); }
  };

  if (isManager) return <div className="flex h-full items-center justify-center p-8 text-sm text-[color:var(--text-2)]">Member chats are available to members only.</div>;

  return (
    <div className="flex h-full min-h-0 bg-[var(--bg)] md:p-5 lg:p-6">
      <div className="flex min-h-0 flex-1 overflow-hidden bg-[var(--bg-2)] md:rounded-2xl md:border md:border-[color:var(--border)]">
        <aside className={`${conversationId ? 'hidden md:flex' : 'flex'} w-full shrink-0 flex-col border-[color:var(--border)] md:w-[320px] md:border-r lg:w-[340px]`}>
          <div className="flex items-center justify-between gap-2 border-b border-[color:var(--border)] px-3 py-3">
            <div><h1 className="text-base font-semibold text-[color:var(--text)]">Member chats</h1><p className="mt-0.5 text-[11px] text-[color:var(--text-3)]">Private conversations between members</p></div>
            <button type="button" onClick={() => { setSearchOpen((v) => !v); setError(''); }} className="rounded-lg bg-[var(--accent)] px-2.5 py-1.5 text-[11px] font-semibold text-white">New chat</button>
          </div>
          {searchOpen && <div className="border-b border-[color:var(--border)] p-3">
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Find a member" aria-label="Find a member" className="h-10 w-full rounded-lg border border-[color:var(--border)] bg-[var(--bg-3)] px-3 text-sm text-[color:var(--text)] outline-none focus:border-[color:var(--accent)]" />
            <div className="mt-2 max-h-44 overflow-y-auto">{people.map((person) => <button type="button" key={person.id} onClick={() => openConversation(person.id)} className="block w-full rounded-lg px-3 py-2 text-left text-sm text-[color:var(--text)] hover:bg-[var(--bg-3)]">{person.name}</button>)}</div>
          </div>}
          <div className="min-h-0 flex-1 overflow-y-auto p-2">
            <button type="button" onClick={() => navigate('/messages')} className="mb-2 w-full rounded-xl border border-[color:var(--border)] px-3 py-2.5 text-left text-[13px] font-medium text-[color:var(--text-2)] hover:bg-[var(--bg-3)]">← Admin team messages</button>
            {loading ? <p className="p-4 text-sm text-[color:var(--text-3)]">Loading chats…</p> : conversations.length ? conversations.map((c) => <button key={c.id} type="button" onClick={() => navigate(`/messages/people/${c.id}`)} className={`mb-1 flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2.5 text-left hover:bg-[var(--bg-3)] ${same(c.id, conversationId) ? 'bg-[var(--bg-3)]' : ''}`}>
              {c.peer.avatar_url ? <img src={c.peer.avatar_url} alt="" className="h-9 w-9 rounded-full object-cover" /> : <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--accent-light)] font-semibold text-[color:var(--accent)]">{(c.peer.name || '?').slice(0, 1).toUpperCase()}</span>}
              <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold text-[color:var(--text)]">{c.peer.name}</span><span className="block truncate text-xs text-[color:var(--text-3)]">{c.last_message?.body || (c.last_message ? 'Attachment' : 'Start chatting')}</span></span>
              {c.unread > 0 && <span className="rounded-full bg-[var(--accent)] px-2 py-0.5 text-[10px] font-bold text-white">{c.unread}</span>}
            </button>) : <p className="p-4 text-center text-sm text-[color:var(--text-3)]">No member chats yet. Start a new chat.</p>}
          </div>
        </aside>

        <main className={`${conversationId ? 'flex' : 'hidden md:flex'} relative min-w-0 flex-1 flex-col`} onDragEnter={onDragEnter} onDragOver={onDragOver} onDragLeave={onDragLeave} onDrop={onDrop}>
          {!conversationId ? <div className="flex flex-1 items-center justify-center text-sm text-[color:var(--text-3)]">Choose a member or start a new chat.</div> : <>
            <header className="flex min-w-0 items-center gap-2 border-b border-[color:var(--border)] px-3 py-2.5 sm:gap-2.5 sm:px-4">
              <button type="button" onClick={() => navigate('/messages/people')} className="shrink-0 rounded-lg px-1.5 py-1.5 text-sm text-[color:var(--text-2)] md:hidden">←</button>
              {peer?.avatar_url ? <img src={peer.avatar_url} alt="" className="h-9 w-9 shrink-0 rounded-full object-cover" /> : <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--accent-light)] font-semibold text-[color:var(--accent)]">{(peer?.name || '?').slice(0, 1).toUpperCase()}</span>}
              <div className="min-w-0 flex-1"><h2 className="truncate text-[13px] font-semibold text-[color:var(--text)]">{peer?.name || 'Member'}</h2><p className="truncate text-[11px] text-[color:var(--text-3)]">Only you and {peer?.name || 'this member'} can see this chat.</p></div>
            </header>
            <div className="min-h-0 min-w-0 flex-1 overflow-y-auto px-2.5 py-2.5 sm:px-4 sm:py-3">
              {error && <p role="alert" className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
              {loading ? <p className="text-sm text-[color:var(--text-3)]">Loading messages…</p> : messages.map((message) => {
                const mine = same(message.sender_id, user?.id);
                return <div key={message.id} className={`mb-2.5 flex ${mine ? 'justify-end' : 'justify-start'}`}><div className={`max-w-[88%] rounded-2xl px-3 py-2 sm:max-w-[70%] ${mine ? 'rounded-br-md bg-[var(--accent)] text-white' : 'rounded-bl-md bg-[var(--bg-3)] text-[color:var(--text)]'}`}>
                  {message.body && <p className="whitespace-pre-wrap break-words text-[13px]">{message.body}</p>}
                  {message.attachments?.map((file) => <a key={file.public_id} href={file.secure_url} target="_blank" rel="noreferrer" className={`mt-2 block overflow-hidden rounded-lg ${mine ? 'text-white' : 'text-[color:var(--accent)]'}`}>
                    {file.resource_type === 'image' ? <img src={file.secure_url} alt={file.original_filename} loading="lazy" className="max-h-60 max-w-full rounded-lg object-contain" /> : <span className="block max-w-64 truncate rounded-lg bg-black/10 px-3 py-1.5 text-xs underline">📄 {file.original_filename}</span>}
                  </a>)}
                  <p className={`mt-1 text-right text-[10px] ${mine ? 'text-white/70' : 'text-[color:var(--text-3)]'}`}>{labelTime(message.created_at)}</p>
                </div></div>;
              })}
              <div ref={tail} />
            </div>
            <form onSubmit={send} className="shrink-0 border-t border-[color:var(--border)] px-2.5 py-2 sm:px-4 sm:py-2.5">
              {files.length > 0 && <div className="mb-1.5 flex flex-wrap gap-1.5">{files.map((file, index) => <span key={`${file.name}-${index}`} className="flex max-w-64 items-center gap-1.5 rounded-lg bg-[var(--bg-3)] px-2 py-1 text-[11px] text-[color:var(--text-2)]"><span className="truncate">{file.name}</span><button type="button" aria-label={`Remove ${file.name}`} onClick={() => setFiles((old) => old.filter((_, i) => i !== index))}>×</button></span>)}</div>}
              {emojiOpen && <div className="mb-1.5 w-full min-w-0 rounded-xl border border-[color:var(--border)] bg-[var(--bg-2)] p-1.5 shadow-sm">
                <div className="mb-1.5 flex min-w-0 flex-col gap-1 sm:flex-row sm:items-center sm:justify-between"><span className="text-[10px] font-semibold text-[color:var(--text-2)]">{EMOJI_CATEGORIES[emojiCategory].name}</span><div className="flex w-full max-w-full gap-1 overflow-x-auto pb-1 sm:w-auto sm:max-w-[80%]">{EMOJI_CATEGORIES.map((category, index) => <button type="button" key={category.name} title={category.name} aria-label={category.name} aria-pressed={emojiCategory === index} onClick={() => setEmojiCategory(index)} className={`h-8 w-8 shrink-0 rounded-lg text-base ${emojiCategory === index ? 'bg-[var(--accent-light)]' : 'hover:bg-[var(--bg-3)]'}`}>{category.icon}</button>)}</div></div>
                <div className="max-h-44 overflow-y-auto"><div className="grid grid-cols-7 gap-1 min-[360px]:grid-cols-8 sm:grid-cols-10 md:grid-cols-12">{EMOJI_CATEGORIES[emojiCategory].emojis.map((emoji, index) => <button type="button" key={`${emoji}-${index}`} aria-label={`Insert ${emoji}`} onClick={() => { setDraft((old) => `${old}${emoji}`); input.current?.focus(); }} className="grid h-8 w-full place-items-center rounded-lg text-lg hover:bg-[var(--bg-3)]">{emoji}</button>)}</div></div>
              </div>}
              <div className="flex flex-wrap items-end gap-2">
                <input ref={fileInput} type="file" multiple accept="image/jpeg,image/png,image/webp,application/pdf" onChange={chooseFiles} className="hidden" />
                <button type="button" title="Attach image or PDF" onClick={() => fileInput.current?.click()} disabled={sending || files.length >= MAX_ATTACHMENTS} className="h-9 w-9 shrink-0 rounded-xl border border-[color:var(--border)] text-base text-[color:var(--text-2)] disabled:opacity-50">＋</button>
                <button type="button" title="Add emoji" onClick={() => setEmojiOpen((v) => !v)} className="h-9 w-9 shrink-0 rounded-xl border border-[color:var(--border)] text-base">😀</button>
                <div className="flex min-w-[210px] flex-[1_1_210px] items-end gap-2">
                  <textarea ref={input} value={draft} onChange={(e) => setDraft(e.target.value)} maxLength={4000} rows={1} placeholder="Write a message" className="max-h-36 min-h-9 min-w-0 flex-1 resize-y rounded-xl border border-[color:var(--border)] bg-[var(--bg-3)] px-2.5 py-2 text-sm text-[color:var(--text)] outline-none focus:border-[color:var(--accent)]" />
                  <button type="submit" disabled={sending || (!draft.trim() && !files.length)} className="h-9 shrink-0 whitespace-nowrap rounded-xl bg-[var(--accent)] px-2.5 text-[13px] font-semibold text-white disabled:opacity-50 sm:px-3">{sending ? 'Sending…' : 'Send'}</button>
                </div>
              </div>
              <p className="mt-1 pl-1 text-[9px] text-[color:var(--text-3)] sm:text-[10px]">Images up to 10 MB · PDFs up to 50 MB · drag files here · attachment links can be shared</p>
            </form>
            {dragging && <div className="pointer-events-none absolute inset-3 z-20 grid place-items-center rounded-2xl border-2 border-dashed border-[var(--accent)] bg-[var(--bg-2)]/90" aria-hidden="true"><div className="rounded-xl bg-[var(--accent-light)] px-5 py-3 text-center text-sm font-semibold text-[color:var(--accent)]">Drop images or PDFs to attach</div></div>}
          </>}
        </main>
      </div>
    </div>
  );
}
