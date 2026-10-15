import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import api from "../api/client";

export default function InviteAcceptance() {
  const { token } = useParams();
  const [invitation, setInvitation] = useState(null);
  const [state, setState] = useState("loading");
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    api.get(`/members/invitation/${encodeURIComponent(token)}`)
      .then(({ data }) => { if (alive) { setInvitation(data); setState("ready"); } })
      .catch((err) => { if (alive) { setError(err.response?.data?.error || "This invitation link is invalid or expired."); setState("error"); } });
    return () => { alive = false; };
  }, [token]);

  const accept = async () => {
    setState("saving");
    setError("");
    try {
      const { data } = await api.post(`/members/invitation/${encodeURIComponent(token)}/accept`);
      setError(data.message || "Your request is waiting for manager approval.");
      setState("accepted");
    } catch (err) {
      setError(err.response?.data?.error || "We couldn't accept this invitation. Please try again.");
      setState("error");
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-[var(--bg)] px-4 py-10">
      <section className="w-full max-w-lg rounded-2xl border border-[var(--border)] bg-[var(--bg-2)] p-7 shadow-lg sm:p-9" aria-live="polite">
        <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--accent-light)] text-xl font-bold text-[var(--accent)]">O</div>
        <h1 className="m-0 text-2xl font-semibold text-[var(--text)]">{state === "accepted" ? "Request sent" : "Join Orbit"}</h1>
        {state === "loading" && <p className="mt-3 text-sm text-[var(--text-2)]">Checking your invitation…</p>}
        {invitation && state !== "accepted" && (
          <><p className="mt-3 text-sm text-[var(--text-2)]">Hi {invitation.name}, you were invited to Orbit with <strong>{invitation.email}</strong>.</p>
          <p className="mt-2 text-sm text-[var(--text-2)]">Accepting sends an approval request to the Orbit managers. You can sign in after a manager approves it.</p>
          <button type="button" className="btn btn-primary mt-5 w-full" onClick={accept} disabled={state === "saving"}>{state === "saving" ? "Sending request…" : "Accept invitation"}</button></>
        )}
        {state === "accepted" && <p className="mt-3 text-sm text-[var(--text-2)]">{error}</p>}
        {state === "error" && <p role="alert" className="mt-4 rounded-lg bg-[color:color-mix(in_srgb,var(--danger)_10%,transparent)] p-3 text-sm text-[var(--danger)]">{error}</p>}
        {state === "accepted" && <Link className="mt-5 inline-block text-sm font-medium text-[var(--accent)]" to="/login">Go to sign in</Link>}
      </section>
    </main>
  );
}
