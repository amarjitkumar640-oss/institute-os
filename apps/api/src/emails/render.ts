import { render } from "@react-email/render";
import type { ReactElement } from "react";

// Every email template in ./templates gets rendered through this one
// function on its way into sendEmail() — keeps the React-Email dependency
// contained to this folder instead of scattered across whichever service
// happens to send a given email.
export async function renderEmail(element: ReactElement): Promise<string> {
  return render(element);
}
