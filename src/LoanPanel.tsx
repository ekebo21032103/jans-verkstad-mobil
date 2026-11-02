import { useState } from "react";
import { api, type Item } from "./local-api";
const today = () => new Date().toLocaleDateString("sv-SE");
export function overdue(item: Item) {
  return !!item.loan?.dueOn && item.loan.dueOn < today();
}
export default function LoanPanel({
  item,
  onSaved,
}: {
  item: Item;
  onSaved: () => Promise<void>;
}) {
  const [borrower, setBorrower] = useState(""),
    [lentOn, setLentOn] = useState(today),
    [dueOn, setDueOn] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function save(returned = false) {
    setBusy(true);
    setError("");
    try {
      const loan = returned
        ? null
        : { borrower: borrower.trim(), lentOn, dueOn };
      await api("/api/items", {
        method: "POST",
        body: JSON.stringify({
          ...item,
          loan,
          loanHistory: returned
            ? [
                ...(item.loanHistory || []),
                { ...item.loan, returnedOn: today() },
              ]
            : item.loanHistory,
        }),
      });
      await onSaved();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="loan-panel" aria-label="Utlåning">
      <h3>Utlåning</h3>
      {item.loan ? (
        <>
          <p>
            <strong>Utlånat till {item.loan.borrower}</strong> sedan{" "}
            {item.loan.lentOn}.
            {item.loan.dueOn && " Åter senast " + item.loan.dueOn + "."}
          </p>
          {overdue(item) && (
            <p className="error">Återlämningsdatum har passerat.</p>
          )}
          <button
            type="button"
            className="secondary"
            disabled={busy}
            onClick={() => save(true)}
          >
            Markera som återlämnat
          </button>
        </>
      ) : (
        <>
          <p>
            Utlåningen gäller hela registerposten ({item.quantity} st). Dela upp
            posten först om bara en del lånas ut.
          </p>
          <label className="field">
            Låntagare
            <input
              maxLength={200}
              value={borrower}
              onChange={(e) => setBorrower(e.target.value)}
            />
          </label>
          <div className="field-row">
            <label className="field">
              Utlånat datum
              <input
                type="date"
                value={lentOn}
                onChange={(e) => setLentOn(e.target.value)}
              />
            </label>
            <label className="field">
              Åter senast (valfritt)
              <input
                type="date"
                min={lentOn}
                value={dueOn}
                onChange={(e) => setDueOn(e.target.value)}
              />
            </label>
          </div>
          <button
            type="button"
            className="secondary"
            disabled={busy || !borrower.trim() || !lentOn}
            onClick={() => save()}
          >
            Registrera utlåning
          </button>
        </>
      )}
      {!!item.loanHistory?.length && (
        <details>
          <summary>Tidigare utlåningar ({item.loanHistory.length})</summary>
          <ul>
            {item.loanHistory.map((l: any, i: number) => (
              <li key={i}>
                {l.borrower}: {l.lentOn} – {l.returnedOn || "återlämnat"}
              </li>
            ))}
          </ul>
        </details>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
