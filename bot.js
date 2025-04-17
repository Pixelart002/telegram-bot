import TelegramBot from 'node-telegram-bot-api';
import fetch from 'node-fetch';
import { createClient } from '@supabase/supabase-js';

const bot = new TelegramBot(process.env.BOT_API_KEY, { polling: true });
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);
const ADMIN_ID = process.env.ADMIN_ID;

bot.onText(/\/start/, async (msg) => {
  const userId = msg.from.id;
  const userName = msg.from.username;
  const { data, error } = await supabase.from('users').select('*').eq('user_id', userId);

  if (!data || data.length === 0) {
    await supabase.from('users').insert([{ user_id: userId, username: userName, completions_left: 2, is_active: true }]);
    return bot.sendMessage(userId, `Welcome ${userName}! You've been registered. You have 2 free completions.`);
  }

  bot.sendMessage(userId, `Welcome back ${userName}! You have ${data[0].completions_left} completions left.`);
});

bot.onText(/\/generate (.+)/, async (msg, match) => {
  const userId = msg.from.id;
  const input = match[1];

  const { data } = await supabase.from('users').select('*').eq('user_id', userId).single();
  if (data.completions_left <= 0) return bot.sendMessage(userId, 'No completions left. Please upgrade.');

  await supabase.from('users').update({ completions_left: data.completions_left - 1 }).eq('user_id', userId);

  bot.sendMessage(userId, 'Generating content...');
  try {
    const res = await fetch("https://api.aimlapi.com/v1", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.GENERATE_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ topic: input })
    });
    const content = await res.json();
    bot.sendMessage(userId, content.generated_text || 'Something went wrong.');
  } catch (err) {
    bot.sendMessage(userId, 'API error occurred.');
  }
});

bot.onText(/\/broadcast (.+)/, async (msg, match) => {
  if (String(msg.from.id) !== ADMIN_ID) return bot.sendMessage(msg.chat.id, 'Unauthorized.');
  const text = match[1];
  const { data } = await supabase.from('users').select('user_id');

  for (const user of data) {
    bot.sendMessage(user.user_id, text).catch(() => {});
  }

  bot.sendMessage(ADMIN_ID, 'Broadcast complete.');
});

bot.onText(/\/status/, async (msg) => {
  if (String(msg.from.id) !== ADMIN_ID) return bot.sendMessage(msg.chat.id, 'Unauthorized.');
  const { data } = await supabase.from('users').select('user_id');
  bot.sendMessage(ADMIN_ID, `Active users: ${data.length}`);
});
