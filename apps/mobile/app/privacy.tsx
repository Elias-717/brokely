import { PRIVACY_NOTICE } from "@brokely/contracts";
import { LegalDocumentScreen } from "../src/ui/legal-document";

/**
 * Privacy notice (PDPA s.7, D-92): from More → Your data and from the sign-in screen, before any
 * data leaves the phone. The same text as GET /privacy on the API.
 */
export default function PrivacyScreen() {
  return <LegalDocumentScreen doc={PRIVACY_NOTICE} />;
}
