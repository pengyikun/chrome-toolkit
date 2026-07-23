import { openChromePage } from "./lib/open-chrome-page";

export default async function Command() {
  await openChromePage("chrome://flags", "Chrome Flags");
}
