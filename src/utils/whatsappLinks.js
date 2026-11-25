function appendDraft(params, text) {
  if (!text) return;
  const existing = params.get("text")?.trim();
  params.set("text", existing ? `${existing}\n\n${text}` : text);
}

function withClickToChatDraft(link, text) {
  if (!text || !/^https?:\/\/(?:wa\.me\/(?:\d+(?=[/?#]|$)|message\/)|(?:api|www)\.whatsapp\.com\/send(?=[/?#]|$))/i.test(link)) {
    return link;
  }

  const url = new URL(link);
  const params = url.searchParams;
  appendDraft(params, text);
  url.search = params.toString().replace(/\+/g, "%20");
  return url.toString();
}

export function getWhatsAppLinks(rawValue, { native = true, text } = {}) {
  const value = String(rawValue || "").trim();
  if (!value) return [];

  const sendLink = /^(whatsapp(?:-smb)?):\/\/send\/?(?:\?([^#]*))?$/i.exec(value);
  const phoneValue = /^[+\d().\s-]+$/.test(value);
  if (sendLink || phoneValue) {
    const params = new URLSearchParams(sendLink?.[2] || "");
    const phone = phoneValue ? value : params.get("phone");
    const digits = phone?.replace(/[^0-9]/g, "") || "";
    if (phone !== null && !digits) return [];

    params.delete("phone");
    appendDraft(params, text);
    const encodeParams = () => text
      ? params.toString().replace(/\+/g, "%20")
      : params.toString();
    const search = encodeParams();
    const webLink = `https://wa.me/${digits}${search ? `?${search}` : ""}`;
    if (!native) return [webLink];

    if (digits) params.set("phone", digits);
    const query = encodeParams();
    const path = `//send${query ? `?${query}` : ""}`;
    const messenger = `whatsapp:${path}`;
    const business = `whatsapp-smb:${path}`;
    return sendLink?.[1].toLowerCase() === "whatsapp-smb"
      ? [business, messenger, webLink]
      : [messenger, business, webLink];
  }

  if (/^https?:\/\/[^/\s]+/i.test(value)) return [withClickToChatDraft(value, text)];
  if (/^(?:wa\.me|(?:api|chat|www)\.whatsapp\.com)\//i.test(value)) {
    return [withClickToChatDraft(`https://${value}`, text)];
  }
  if (native && /^whatsapp(?:-smb)?:\/\//i.test(value)) return [value];
  return [];
}

export async function tryOpenWhatsAppLinks(links, openURL) {
  for (const link of links) {
    try {
      await openURL(link);
      return true;
    } catch {
      // Try the next app or the HTTPS fallback.
    }
  }
  return false;
}
