import { ALL_MASECHTOS } from '../../shared/shas';

/**
 * Named test data for the device suite, loaded by POST /api/dev/seed.
 * Every scenario starts from empty tables and uses fixed ids, slugs and
 * timestamps, so pages render the same on every run.
 */

type Seeder = (env: Env) => Promise<void>;

// Children before parents, to satisfy foreign keys.
const TABLES = [
  'claims',
  'participant_login_codes',
  'contacts',
  'participants',
  'campaigns',
  'sessions',
  'login_codes',
  'users',
  'outbound_messages',
  'opt_outs',
  'rate_limits',
];

export async function resetDatabase(env: Env): Promise<void> {
  await env.DB.batch(TABLES.map((table) => env.DB.prepare(`DELETE FROM ${table}`)));
}

const AT = '2030-01-10T15:00:00.000Z';
export const SEED_ORGANIZER = { id: 'seed-organizer', email: 'organizer@example.com' };

interface SeedCampaign {
  id: string;
  slug: string;
  title: string;
  honoree: string;
  dedication?: string;
  message?: string | null;
  endDate?: string;
  timezone?: string;
  status?: string;
}

interface SeedPerson {
  name: string;
  anonymous?: boolean;
  phone?: string;
  email?: string;
  source?: 'public' | 'organizer';
  /** Masechta ids this person holds, and which of them are finished. */
  taken?: string[];
  finished?: string[];
}

function campaignStatements(env: Env, c: SeedCampaign): D1PreparedStatement[] {
  const status = c.status ?? 'active';
  return [
    env.DB.prepare(
      `INSERT INTO campaigns (id, owner_user_id, slug, title, honoree_name, dedication_type,
         message, end_date, timezone, status, activated_on, completed_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      c.id, SEED_ORGANIZER.id, c.slug, c.title, c.honoree, c.dedication ?? 'ilui_nishmas',
      c.message ?? null, c.endDate ?? '2030-02-14', c.timezone ?? 'America/New_York', status,
      status === 'draft' ? null : '2030-01-10', status === 'completed' ? AT : null, AT, AT,
    ),
  ];
}

function peopleStatements(env: Env, campaignId: string, people: SeedPerson[]): D1PreparedStatement[] {
  const statements: D1PreparedStatement[] = [];
  people.forEach((person, index) => {
    const participantId = `${campaignId}-p${index + 1}`;
    statements.push(
      env.DB.prepare(
        `INSERT INTO participants (id, campaign_id, name, is_anonymous, phone, email, source, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(
        participantId, campaignId, person.name, person.anonymous ? 1 : 0, person.phone ?? null,
        person.email ?? null, person.source ?? 'public', AT,
      ),
    );
    const claim = (masechtaId: string, finished: boolean) =>
      env.DB.prepare(
        `INSERT INTO claims (id, campaign_id, participant_id, masechta_id, status, claimed_at, completed_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ).bind(
        `${campaignId}-${masechtaId}`, campaignId, participantId, masechtaId,
        finished ? 'completed' : 'claimed', AT, finished ? AT : null,
      );
    for (const id of person.finished ?? []) statements.push(claim(id, true));
    for (const id of person.taken ?? []) statements.push(claim(id, false));
  });
  return statements;
}

const CONTACTS: [name: string, phone: string | null, email: string | null, invited: boolean][] = [
  ['Moshe Katz', '+17185550101', 'moshe@example.com', true],
  ['Rabbi Yitzchok Berger', '+17185550111', null, true],
  ['Shira Goldstein', null, 'shira@example.com', false],
  ['Menachem Roth', '+17185550112', 'menachem@example.com', false],
];

function contactStatements(env: Env, campaignId: string): D1PreparedStatement[] {
  return CONTACTS.map(([name, phone, email, invited], index) =>
    env.DB.prepare(
      'INSERT INTO contacts (id, campaign_id, name, phone, email, invited_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    ).bind(`${campaignId}-contact${index + 1}`, campaignId, name, phone, email, invited ? AT : null, AT),
  );
}

const organizer = (env: Env) =>
  env.DB.prepare('INSERT INTO users (id, email, name, created_at) VALUES (?, ?, ?, ?)').bind(
    SEED_ORGANIZER.id, SEED_ORGANIZER.email, null, AT,
  );

const ACTIVE: SeedCampaign = {
  id: 'seed-active',
  slug: 'chart234',
  title: 'Mishnayos for the shloshim',
  honoree: 'נפתלי בן יעקב',
  message: 'Please try to finish by the shloshim. Tizku l’mitzvos.',
};

const DRAFT: SeedCampaign = {
  id: 'seed-draft',
  slug: 'draft234',
  title: 'Mishnayos for the yahrzeit',
  // A name typed in English, so both scripts are covered.
  honoree: 'Sarah bas Avraham',
  endDate: '2030-06-20',
  status: 'draft',
};

const PARTLY_TAKEN: SeedPerson[] = [
  { name: 'Moshe Katz', phone: '+17185550101', finished: ['berachos', 'peah'], taken: ['demai'] },
  { name: 'Dovid Levi', email: 'dovid@example.com', finished: ['shabbos'], taken: ['eruvin', 'pesachim'] },
  { name: 'Yosef Friedman', anonymous: true, phone: '+17185550102', finished: ['yoma', 'sukkah'] },
  { name: 'Rabbi Shmuel Goldberg', finished: ['bava-kamma', 'bava-metzia', 'bava-basra'], taken: ['sanhedrin'] },
  { name: 'Chaim Rosen', phone: '+17185550103', taken: ['kesubos', 'nedarim'] },
  { name: 'Avi Schwartz', source: 'organizer', finished: ['avos'], taken: ['makkos'] },
  { name: 'Eli Weiss', email: 'eli@example.com', finished: ['megillah', 'taanis'], taken: ['rosh-hashanah'] },
  { name: 'Binyamin Stern', taken: ['zevachim', 'menachos'] },
  { name: 'The Kaplan family', phone: '+17185550104', finished: ['kinnim', 'tamid', 'middos'], taken: ['keilim'] },
];

const LONG_NAMES: SeedPerson[] = [
  {
    name: 'Rabbi Avraham Yehoshua Heschel Halevi Horowitz-Rabinowitz of Yerushalayim',
    finished: ['berachos'],
    taken: ['shabbos', 'keilim'],
  },
  { name: 'Shmuelyitzchokmeirhakohenfriedlanderrosenbergschwartzman', taken: ['peah', 'kinnim'] },
  { name: 'משפחת רבינוביץ-הורוויץ מירושלים עיר הקודש תובב״א', finished: ['avos', 'tamid'] },
];

export const SCENARIOS: Record<string, Seeder> = {
  empty: async () => {},

  /** The organizer with no campaigns yet. */
  organizer: async (env) => {
    await env.DB.batch([organizer(env)]);
  },

  /** A draft campaign, and an active one with a mix of finished, taken and open masechtos. */
  'partly-taken': async (env) => {
    await env.DB.batch([
      organizer(env),
      ...campaignStatements(env, ACTIVE),
      ...peopleStatements(env, ACTIVE.id, PARTLY_TAKEN),
      ...contactStatements(env, ACTIVE.id),
      ...campaignStatements(env, DRAFT),
    ]);
  },

  /** As partly-taken, plus a second submission made with the first person's phone number. */
  'shared-phone': async (env) => {
    await env.DB.batch([
      organizer(env),
      ...campaignStatements(env, ACTIVE),
      ...peopleStatements(env, ACTIVE.id, [
        ...PARTLY_TAKEN,
        { name: 'Moshe Katz, for my father', phone: '+17185550101', anonymous: true, finished: ['gittin'], taken: ['sotah'] },
      ]),
    ]);
  },

  /** An active campaign whose name was typed in English. */
  'english-name': async (env) => {
    await env.DB.batch([
      organizer(env),
      ...campaignStatements(env, { ...ACTIVE, honoree: 'Sarah bas Avraham', dedication: 'refuah_shleima', message: null }),
      ...peopleStatements(env, ACTIVE.id, PARTLY_TAKEN),
    ]);
  },

  /** Every masechta finished. */
  completed: async (env) => {
    const names = ['Moshe Katz', 'Dovid Levi', 'Chaim Rosen', 'Eli Weiss', 'Avi Schwartz', 'Binyamin Stern', 'Yosef Friedman'];
    const people: SeedPerson[] = names.map((name, i) => ({
      name,
      finished: ALL_MASECHTOS.filter((m) => m.index % names.length === i).map((m) => m.id),
    }));
    await env.DB.batch([
      organizer(env),
      ...campaignStatements(env, { ...ACTIVE, status: 'completed' }),
      ...peopleStatements(env, ACTIVE.id, people),
    ]);
  },

  /** Very long names, to prove nothing clips or overflows. */
  'long-names': async (env) => {
    await env.DB.batch([
      organizer(env),
      ...campaignStatements(env, {
        ...ACTIVE,
        title: 'Mishnayos in memory of our dear father, grandfather and great-grandfather, for the first yahrzeit',
        honoree: 'הרב אברהם יהושע העשיל בן הרב שמואל יצחק מאיר הכהן זצוק״ל',
        message:
          'נא לסיים עד היארצייט. Please finish by the yahrzeit, and mark your masechta finished here so the family knows that all of Shas was learned.',
      }),
      ...peopleStatements(env, ACTIVE.id, LONG_NAMES),
    ]);
  },

  /** An active campaign whose target date has passed. */
  'past-date': async (env) => {
    await env.DB.batch([
      organizer(env),
      ...campaignStatements(env, { ...ACTIVE, endDate: '2030-01-08' }),
      ...peopleStatements(env, ACTIVE.id, PARTLY_TAKEN),
    ]);
  },
};

export async function seed(env: Env, scenario: string): Promise<boolean> {
  const seeder = SCENARIOS[scenario];
  if (!seeder) return false;
  await resetDatabase(env);
  await seeder(env);
  return true;
}
