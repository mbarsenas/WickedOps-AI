import OpenAI from 'openai';

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function proposeReply(input: {
  instructions: string;
  subject?: string | null;
  sender: string;
  message: string;
}) {
  const response = await client.responses.create({
    model: 'gpt-5-mini',
    input: [
      {
        role: 'system',
        content: `You are an email agent. Follow these instructions exactly:\n${input.instructions}\nReturn only JSON with keys action_type, reply_text, rationale. action_type must be send_email_reply.`,
      },
      {
        role: 'user',
        content: `From: ${input.sender}\nSubject: ${input.subject ?? ''}\n\n${input.message}`,
      },
    ],
  });

  const text = response.output_text.trim();
  return JSON.parse(text) as { action_type: 'send_email_reply'; reply_text: string; rationale: string };
}
