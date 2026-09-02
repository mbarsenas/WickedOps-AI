import { requireChatGPTUser } from "../chatgpt-auth";
import AssistantConsole from "./assistant-console";

export const dynamic = "force-dynamic";

export default async function AssistantPage() {
  const user = await requireChatGPTUser("/assistant");
  return <AssistantConsole displayName={user.displayName} />;
}
