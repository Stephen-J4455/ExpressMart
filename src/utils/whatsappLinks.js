export function getWhatsAppLinks(rawValue, { native = true } = {}) {
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
    const search = params.toString();
    const webLink = `https://wa.me/${digits}${search ? `?${search}` : ""}`;
    if (!native) return [webLink];

    if (digits) params.set("phone", digits);
    const query = params.toString();
    const path = `//send${query ? `?${query}` : ""}`;
    const messenger = `whatsapp:${path}`;
    const business = `whatsapp-smb:${path}`;
    return sendLink?.[1].toLowerCase() === "whatsapp-smb"
      ? [business, messenger, webLink]
      : [messenger, business, webLink];
  }

  if (/^https?:\/\/[^/\s]+/i.test(value)) return [value];
  if (/^(?:wa\.me|(?:api|chat|www)\.whatsapp\.com)\//i.test(value)) {
    return [`https://${value}`];
  }
  if (native && /^whatsapp(?:-smb)?:\/\//i.test(value)) return [value];
  return [];
}
