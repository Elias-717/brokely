import { PageScreen } from "../src/ui/components";
import { TngReviewList } from "../src/ui/tng-pending";

/**
 * From TNG (D-142): every payment the phone caught that is still waiting, newest first and
 * grouped by day, each with its own buttons. Home shows only the newest and links here.
 */
export default function TngReviewScreen() {
  return (
    <PageScreen title="From TNG">
      <TngReviewList />
    </PageScreen>
  );
}
