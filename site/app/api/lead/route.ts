import {randomUUID} from 'node:crypto';
import {issueTelegramLink} from '@/lib/telegram-link';
import { NextRequest, NextResponse } from 'next/server';
import { ACCESS_COOKIE, ACCESS_SECONDS, issueAccess } from '@/lib/access';
import { validateLead } from '@/lib/validation';
import { persistLead, registrationSecret, storageConfigured, storageMode } from '@/lib/storage';
import { apiError, rateLimited, readSmallJson, validOrigin } from '@/lib/request';

export async function POST(request: NextRequest) {
  if (!validOrigin(request)) return apiError('Обновите страницу и попробуйте ещё раз', 403);
  if (rateLimited(request, 'lead')) return apiError('Слишком много попыток. Попробуйте через 10 минут', 429);
  let body: unknown;
  try { body = await readSmallJson(request); } catch { return apiError('Не удалось прочитать форму. Проверьте данные', 400); }
  const lead = validateLead(body);
  if (!lead) return apiError('Укажите имя, телефон с кодом страны, Telegram и согласие на обработку данных', 400);
  const key = registrationSecret();
  if (!key || !storageConfigured() || !process.env.SITE_OWNER_NAME || !process.env.SITE_OWNER_CONTACT) {
    const issues: string[] = [];
    if (!process.env.SITE_OWNER_NAME) issues.push('SITE_OWNER_NAME missing');
    if (!process.env.SITE_OWNER_CONTACT) issues.push('SITE_OWNER_CONTACT missing');
    if (!key) issues.push('REGISTRATION_SECRET missing or invalid; Supabase fallback key unavailable');
    if (storageMode() === 'supabase') {
      if (!process.env.SUPABASE_URL) issues.push('SUPABASE_URL missing');
      if (!process.env.SUPABASE_SECRET_KEY) issues.push('SUPABASE_SECRET_KEY missing');
    } else if (storageMode() === 'sqlite') {
      if (!process.env.LEAD_STORAGE) issues.push('LEAD_STORAGE missing (defaults to local SQLite); set supabase on Vercel');
      if (!storageConfigured()) issues.push('SQLite configuration incomplete; use LEAD_STORAGE=supabase on Vercel');
    } else issues.push('LEAD_STORAGE invalid; expected supabase or sqlite');
    // Only known variable names and fixed messages. Never log values or contact data.
    console.error('REGISTRATION_CONFIG_MISSING', issues);
    return apiError('Регистрация пока недоступна. Подключаем приём заявок — попробуйте позже', 503);
  }
  const leadId = randomUUID();
  try { await persistLead(lead, leadId); }
  catch { return apiError('Не удалось сохранить регистрацию. Попробуйте позже', 503); }
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chat = process.env.TELEGRAM_CHAT_ID;
  if (token && chat) {
    try {
      const notification = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chat, text: `Новая регистрация\nИмя: ${lead.name}\nТелефон: ${lead.phone}\nTelegram: ${lead.telegram}` }), signal: AbortSignal.timeout(5000),
      });
      if (!notification.ok) console.warn('Lead stored; notification delivery failed');
    } catch { console.warn('Lead stored; notification unavailable'); }
  }
  const response = NextResponse.json({ ok: true, telegramUrl: issueTelegramLink(leadId,key) }, { headers: { 'Cache-Control': 'no-store' } });
  response.cookies.set(ACCESS_COOKIE, issueAccess(key), { httpOnly: true, secure: request.nextUrl.protocol === 'https:', sameSite: 'strict', path: '/', maxAge: ACCESS_SECONDS });
  return response;
}
