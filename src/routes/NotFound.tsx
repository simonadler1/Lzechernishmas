import { Page } from '../components/layout';
import { PageHeading } from '../components/ui';

export default function NotFound() {
  return (
    <Page narrow className="pt-12">
      <PageHeading>Page not found</PageHeading>
      <p className="mt-2 text-ink-muted">
        This address does not lead anywhere. If you scanned a sign or followed a link, check that it was copied in
        full.
      </p>
    </Page>
  );
}
