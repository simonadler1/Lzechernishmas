import { useMutation } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router';
import { Page } from '../components/layout';
import { Button, Field, Notice, PageHeading } from '../components/ui';
import { api, errorMessage, fieldErrors } from '../lib/api';
import { useCurrentUser, useSetCurrentUser, type User } from '../lib/auth';

/** Only same-site paths are followed after login. */
function safeNext(value: string | null): string {
  return value && value.startsWith('/') && !value.startsWith('//') ? value : '/campaigns';
}

export default function Login() {
  const { user } = useCurrentUser();
  const setUser = useSetCurrentUser();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const next = safeNext(params.get('next'));

  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [sentTo, setSentTo] = useState<string | null>(null);

  const requestCode = useMutation({
    mutationFn: () => api.post('/api/auth/request-code', { email }),
    onSuccess: () => {
      setSentTo(email.trim());
      setCode('');
    },
  });

  const verify = useMutation({
    mutationFn: () => api.post<{ user: User }>('/api/auth/verify', { email: sentTo, code }),
    onSuccess: ({ user: loggedIn }) => {
      setUser(loggedIn);
      navigate(next, { replace: true });
    },
  });

  if (user) return <Navigate to={next} replace />;

  const submitEmail = (event: FormEvent) => {
    event.preventDefault();
    requestCode.mutate();
  };
  const submitCode = (event: FormEvent) => {
    event.preventDefault();
    verify.mutate();
  };

  return (
    <Page narrow className="pt-12">
      <PageHeading>Organizer login</PageHeading>

      {sentTo === null ? (
        <form onSubmit={submitEmail} className="mt-6 space-y-4" noValidate>
          <p className="text-ink-muted">
            Enter your email and we will send a 6-digit code. There is no password, and a new email creates your
            account.
          </p>
          <Field
            label="Email"
            type="email"
            name="email"
            inputMode="email"
            autoComplete="email"
            autoCapitalize="none"
            spellCheck={false}
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            error={fieldErrors(requestCode.error).email}
          />
          {requestCode.error && !fieldErrors(requestCode.error).email && (
            <Notice>{errorMessage(requestCode.error)}</Notice>
          )}
          <Button type="submit" busy={requestCode.isPending} className="w-full sm:w-auto">
            Send code
          </Button>
        </form>
      ) : (
        <form onSubmit={submitCode} className="mt-6 space-y-4" noValidate>
          <p className="text-ink-muted">
            We sent a code to <span className="font-semibold text-ink">{sentTo}</span>. It works for 10 minutes.
          </p>
          <Field
            label="6-digit code"
            name="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]*"
            maxLength={6}
            required
            autoFocus
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
            error={fieldErrors(verify.error).code}
          />
          {verify.error && !fieldErrors(verify.error).code && <Notice>{errorMessage(verify.error)}</Notice>}
          <div className="flex flex-wrap gap-2">
            <Button type="submit" busy={verify.isPending} className="w-full sm:w-auto">
              Log in
            </Button>
            <Button
              variant="quiet"
              onClick={() => {
                setSentTo(null);
                verify.reset();
              }}
            >
              Use a different email
            </Button>
          </div>
        </form>
      )}
    </Page>
  );
}
