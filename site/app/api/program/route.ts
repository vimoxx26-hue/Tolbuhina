import { NextRequest } from 'next/server';
import { ACCESS_COOKIE, verifyAccess } from '@/lib/access';
import { buildProgram } from '@/lib/program';
import { apiError, rateLimited, readSmallJson, validOrigin } from '@/lib/request';
import { validateQuiz } from '@/lib/validation';
import { registrationSecret } from '@/lib/storage';
export async function POST(request: NextRequest) {
  if (!validOrigin(request)) return apiError('Обновите страницу и попробуйте ещё раз', 403);
  const secret = registrationSecret();
  if (!secret || !verifyAccess(request.cookies.get(ACCESS_COOKIE)?.value, secret)) return apiError('Для просмотра программы завершите регистрацию', 401);
  if (rateLimited(request, 'program', 40)) return apiError('Слишком много запросов. Попробуйте позже', 429);
  let value: unknown;
  try { value = await readSmallJson(request); } catch { return apiError('Не удалось прочитать ответы теста', 400); }
  const quiz = validateQuiz(value);
  if (!quiz) return apiError('Проверьте ответы на все вопросы теста', 400);
  return Response.json(buildProgram(quiz), { headers: { 'Cache-Control': 'private, no-store', Vary: 'Cookie' } });
}
