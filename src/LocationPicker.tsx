import { useState } from "react";

type Props = {
  places: { name: string }[];
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
};

export default function LocationPicker({
  places,
  value,
  onChange,
  disabled,
}: Props) {
  const [creating, setCreating] = useState(false);
  // Keep an existing item's location selectable even if its place record is missing.
  const names = [
    ...new Set([
      ...places.map((place) => place.name),
      ...(!creating && value ? [value] : []),
    ]),
  ].sort((a, b) =>
    a.localeCompare(b, "sv", { numeric: true, sensitivity: "base" }),
  );

  return (
    <>
      <label className="field">
        Förvaringsplats *
        <select
          aria-label="Förvaringsplats"
          required
          disabled={disabled}
          value={creating ? "new" : value ? "place:" + value : ""}
          onChange={(event) => {
            const selected = event.target.value;
            setCreating(selected === "new");
            onChange(selected.startsWith("place:") ? selected.slice(6) : "");
          }}
        >
          <option value="" disabled>
            Välj förvaringsplats…
          </option>
          {names.map((name) => (
            <option key={name} value={"place:" + name}>
              {name}
            </option>
          ))}
          <option value="new">＋ Ny förvaringsplats</option>
        </select>
        <small>Välj platsen där föremålet ligger.</small>
      </label>
      {creating && (
        <label className="field">
          Namn på ny förvaringsplats *
          <input
            required
            autoFocus
            disabled={disabled}
            maxLength={200}
            value={value}
            placeholder="Till exempel: Trälåda 9"
            onChange={(event) => onChange(event.target.value)}
          />
          <small>Platsen skapas när du sparar föremålet.</small>
        </label>
      )}
    </>
  );
}
