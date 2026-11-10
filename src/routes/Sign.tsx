import { useLayoutEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { Link, useParams } from 'react-router';
import { formatLongDate } from '../../shared/dates';
import { dedicationPhrase } from '../../shared/dedication';
import { hebrewDate } from '../../shared/hebrew-date';
import { Page } from '../components/layout';
import { Button, Notice, PageHeading, Skeleton, hasHebrew } from '../components/ui';
import { ApiError, errorMessage } from '../lib/api';
import { publicLink, useCampaign } from '../lib/campaigns';
import { cx } from '../lib/cx';
import { QUIET_ZONE, qrMatrix, qrPath } from '../lib/qr';

type Paper = 'letter' | 'a4';

// The printable area: the page minus half-inch margins.
const PAPER: Record<Paper, { label: string; css: string; width: number; height: number }> = {
  letter: { label: 'Letter', css: 'letter', width: 7.5, height: 10 },
  a4: { label: 'A4', css: 'A4', width: 7.27, height: 10.69 },
};

// Sizes tried for the organizer's text, largest first, as shares of the sheet's width.
// The smallest is about 8.5 point on Letter paper.
const MESSAGE_SIZES = ['3cqw', '2.6cqw', '2.2cqw', '1.9cqw', '1.6cqw'];

/**
 * Sets the organizer's text at the largest size that lets the sheet stay one
 * page. Returns true when even the smallest size does not fit, in which case
 * the end of the text is cut off on the sign.
 */
function useFittedMessage(
  blockRef: RefObject<HTMLDivElement | null>,
  messageRef: RefObject<HTMLParagraphElement | null>,
  dependencies: unknown[],
): boolean {
  const [cut, setCut] = useState(false);
  useLayoutEffect(() => {
    const fit = () => {
      const block = blockRef.current;
      const message = messageRef.current;
      if (!block || !message) return setCut(false);
      // The block is clipped to the room the sheet has left, so the text fits when its last line is inside it.
      const overflows = () => message.getBoundingClientRect().bottom > block.getBoundingClientRect().bottom + 1;
      for (const size of MESSAGE_SIZES) {
        message.style.fontSize = size;
        if (!overflows()) return setCut(false);
      }
      setCut(true);
    };
    fit();
    // Measure again once the fonts have loaded, since they change the line breaks.
    let live = true;
    void document.fonts.ready.then(() => live && fit());
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, dependencies);
  return cut;
}

function QrCode({ text }: { text: string }) {
  const { path, size } = useMemo(() => {
    const matrix = qrMatrix(text);
    return { path: qrPath(matrix), size: matrix.size + QUIET_ZONE * 2 };
  }, [text]);
  return (
    <svg viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`QR code for ${text}`} shapeRendering="crispEdges" className="block size-full">
      <path d={path} fill="currentColor" />
    </svg>
  );
}

export default function Sign() {
  const { id = '' } = useParams();
  const { data: campaign, error, isPending } = useCampaign(id);
  const [paper, setPaper] = useState<Paper>('letter');
  const topRef = useRef<HTMLDivElement>(null);
  const messageRef = useRef<HTMLParagraphElement>(null);
  const messageCut = useFittedMessage(topRef, messageRef, [paper, campaign?.message, campaign?.honoreeName]);

  if (isPending) {
    return (
      <Page narrow>
        <Skeleton className="h-96 w-full" />
      </Page>
    );
  }
  if (error || !campaign) {
    return (
      <Page narrow>
        <Notice>
          {error instanceof ApiError && error.status === 404
            ? 'This campaign does not exist, or it belongs to another account.'
            : errorMessage(error)}
        </Notice>
      </Page>
    );
  }

  const link = publicLink(campaign.slug);
  const shown = link.replace(/^https?:\/\//, '');
  const size = PAPER[paper];

  return (
    <Page className="print:m-0 print:max-w-none print:p-0">
      {/* The printed page is exactly the sheet: its size is the paper minus these margins. */}
      <style>{`@page { size: ${size.css}; margin: 0.5in; }`}</style>

      <div className="print:hidden">
        <p>
          <Link to={`/campaigns/${campaign.id}`} className="text-link">
            Back to the campaign
          </Link>
        </p>
        <PageHeading className="mt-4">Printable sign</PageHeading>
        <p className="mt-2 max-w-prose text-ink-muted">
          Hang a copy in each shul. Every copy leads to the same chart, so a masechta taken in one shul shows as taken
          in all of them.
        </p>
        {campaign.status !== 'active' && (
          <div className="mt-4 max-w-prose">
            <Notice>
              {campaign.status === 'draft'
                ? 'This campaign is still a draft, so the QR code leads nowhere yet. Activate it before you hang the sign.'
                : campaign.status === 'completed'
                  ? 'All of Shas has been finished. The QR code now leads to the finished chart.'
                  : 'This campaign is archived, so the QR code leads nowhere.'}
            </Notice>
          </div>
        )}
        {messageCut && (
          <div className="mt-4 max-w-prose">
            <Notice>
              Your information for participants is too long for the sign, so its end is cut off. Shorten it in the
              campaign details to print all of it. The chart page still shows it in full.
            </Notice>
          </div>
        )}
        <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2">
          <fieldset className="flex items-center gap-4">
            <legend className="sr-only">Paper size</legend>
            {(Object.keys(PAPER) as Paper[]).map((key) => (
              <label key={key} className="flex min-h-11 cursor-pointer items-center gap-2">
                <input
                  type="radio"
                  name="paper"
                  className="size-5 accent-tekhelet"
                  checked={paper === key}
                  onChange={() => setPaper(key)}
                />
                {PAPER[key].label}
              </label>
            ))}
          </fieldset>
          <Button onClick={() => window.print()}>Print</Button>
        </div>
      </div>

      {/*
        Every size inside the sheet is a share of the sheet's width (cqw), so the
        on-screen preview and the printed page are the same picture at different scales.
      */}
      <div
        data-testid="sign-sheet"
        className={cx(
          'sign-sheet mx-auto mt-6 flex flex-col items-center justify-between overflow-hidden border border-line-strong bg-white text-center text-black',
          'print:mt-0 print:border-0',
        )}
        style={{
          containerType: 'size',
          width: '100%',
          maxWidth: `${size.width}in`,
          aspectRatio: `${size.width} / ${size.height}`,
        }}
      >
        {/* This block gives way when space runs out; the code and the closing line never do. */}
        <div ref={topRef} className="min-h-0 w-full shrink overflow-hidden" style={{ padding: '3.5cqw 4cqw 0' }}>
          <p style={{ fontSize: '3cqw' }}>
            All of Shas Mishnayos is being learned {dedicationPhrase(campaign.dedicationType, '').trim()}
          </p>
          <h2
            dir="auto"
            lang={hasHebrew(campaign.honoreeName) ? 'he' : undefined}
            className="font-hebrew font-bold"
            style={{ fontSize: campaign.message ? '11cqw' : '13cqw', lineHeight: 1.1, marginTop: '1.5cqw', textWrap: 'balance' }}
            data-long={campaign.honoreeName.length > 28 || undefined}
          >
            {campaign.honoreeName}
          </h2>
          <p style={{ fontSize: '3cqw', marginTop: '1.5cqw' }}>
            Please finish by {formatLongDate(campaign.endDate)},{' '}
            <span dir="rtl" lang="he" className="font-hebrew" style={{ fontSize: '3.4cqw', whiteSpace: 'nowrap' }}>
              {hebrewDate(campaign.endDate)}
            </span>
          </p>
          {campaign.message && (
            <p
              ref={messageRef}
              dir="auto"
              data-testid="sign-message"
              className="whitespace-pre-wrap"
              style={{ fontSize: MESSAGE_SIZES[0], lineHeight: 1.35, marginTop: '2.5cqw' }}
            >
              {campaign.message}
            </p>
          )}
        </div>

        <div className="flex shrink-0 flex-col items-center">
          {/*
            53% of the printable width is 3.85 inches or more on both paper sizes. About a fifth
            of that is the blank border a scanner needs, which leaves the code itself over 3 inches.
          */}
          <div style={{ width: '53cqw', height: '53cqw' }}>
            <QrCode text={link} />
          </div>
          <p className="font-semibold" style={{ fontSize: '3.6cqw', marginTop: '-1.5cqw' }}>
            Scan to take a masechta
          </p>
          <p style={{ fontSize: '3cqw' }}>
            or go to <span className="font-semibold break-all">{shown}</span>
          </p>
        </div>

        <p className="shrink-0" style={{ fontSize: '2.3cqw', padding: '0 5cqw 3cqw', textWrap: 'balance' }}>
          This is the one shared chart for this campaign.
          It is the same in every shul, so you can see which masechtos are still open and whether all of Shas was
          finished.
        </p>
      </div>
    </Page>
  );
}
