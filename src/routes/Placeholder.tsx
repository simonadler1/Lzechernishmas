import { Page } from '../components/layout';
import { PageHeading } from '../components/ui';

/** Stands in for a page a later task builds. */
export default function Placeholder({ title }: { title: string }) {
  return (
    <Page narrow>
      <PageHeading>{title}</PageHeading>
      <p className="mt-2 text-ink-muted">This page is not built yet.</p>
    </Page>
  );
}
