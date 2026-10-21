import { TERMS } from "@brokely/contracts";
import { LegalDocumentScreen } from "../src/ui/legal-document";

/**
 * Terms of use (D-93): from More → Your data and from the sign-in screen, where creating an
 * account means agreeing to them. The same text as GET /terms on the API.
 */
export default function TermsScreen() {
  return <LegalDocumentScreen doc={TERMS} />;
}
