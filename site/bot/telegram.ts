export type TelegramMethod = 'getMe' | 'getWebhookInfo' | 'getUpdates' | 'sendMessage' | 'editMessageText' | 'answerCallbackQuery';
export class TelegramError extends Error {
  constructor(public readonly code: number, public readonly retryAfter = 0) { super(`Telegram API error ${code}`); }
}
export function createTelegram(token: string, request: typeof fetch = fetch) {
  if (!token || /[\s/]/.test(token) || token.length > 512) throw new Error('TELEGRAM_BOT_TOKEN is missing or invalid; set it privately in .env.local');
  return async <T = unknown>(method: TelegramMethod, payload: Record<string, unknown> = {}): Promise<T> => {
    let response: Response;
    try { response = await request(`https://api.telegram.org/bot${token}/${method}`, { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(payload), signal: AbortSignal.timeout(method === 'getUpdates' ? 40000 : 15000) }); }
    catch { throw new TelegramError(0); } // Do not expose token-bearing URLs from fetch errors.
    let body: {ok?:boolean; result?:T; error_code?:number; parameters?:{retry_after?:number}};
    try { body = await response.json(); } catch { throw new TelegramError(response.status); }
    if (!response.ok || !body.ok) throw new TelegramError(body.error_code || response.status, Math.min(body.parameters?.retry_after || 0, 300));
    return body.result as T;
  };
}
