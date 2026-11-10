export const DEDICATION_TYPES = ['ilui_nishmas', 'refuah_shleima', 'zechus', 'other'] as const;
export type DedicationType = (typeof DEDICATION_TYPES)[number];

export const DEDICATION_LABELS: Record<DedicationType, string> = {
  ilui_nishmas: "L'ilui nishmas",
  refuah_shleima: 'For a refuah shleima',
  zechus: 'As a zechus',
  other: 'Other',
};

const TITLE_LEADS: Record<DedicationType, string> = {
  ilui_nishmas: "L'ilui nishmas",
  refuah_shleima: 'Refuah shleima',
  zechus: 'Zechus',
  other: 'In honor of',
};

/** What a campaign is called in its organizer's list: "L'ilui nishmas: Naftali ben Yaakov". Nobody types it. */
export function campaignTitleLead(type: DedicationType): string {
  return TITLE_LEADS[type];
}

export function campaignTitle(type: DedicationType, name: string): string {
  return `${campaignTitleLead(type)}: ${name}`;
}

/** "l'ilui nishmas Naftali ben Yaakov", for use inside a sentence. */
export function dedicationPhrase(type: DedicationType, name: string): string {
  switch (type) {
    case 'ilui_nishmas':
      return `l'ilui nishmas ${name}`;
    case 'refuah_shleima':
      return `for a refuah shleima for ${name}`;
    case 'zechus':
      return `as a zechus for ${name}`;
    case 'other':
      return `in honor of ${name}`;
  }
}

/** The line shown under the honoree's name, where the name is not repeated. */
export function dedicationLine(type: DedicationType): string {
  switch (type) {
    case 'ilui_nishmas':
      return "Learned l'ilui nishmas";
    case 'refuah_shleima':
      return 'Learned for a refuah shleima for';
    case 'zechus':
      return 'Learned as a zechus for';
    case 'other':
      return 'Learned in honor of';
  }
}
