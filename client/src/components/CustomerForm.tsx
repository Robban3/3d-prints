import { TextAreaField, TextField } from './Field';
import type { CustomerDetails } from '../types';

interface Props {
  value: CustomerDetails;
  errors: Record<string, string>;
  onChange: (patch: Partial<CustomerDetails>) => void;
  noteLabel?: string;
  notePlaceholder?: string;
}

/** Delas mellan kassan och formuläret för egna printjobb. */
export function CustomerForm({ value, errors, onChange, noteLabel, notePlaceholder }: Props) {
  return (
    <div className="stack">
      <div className="grid-2">
        <TextField
          label="Namn"
          name="name"
          autoComplete="name"
          value={value.name}
          error={errors['customer.name']}
          onChange={(event) => onChange({ name: event.target.value })}
        />
        <TextField
          label="E-post"
          name="email"
          type="email"
          autoComplete="email"
          value={value.email}
          error={errors['customer.email']}
          onChange={(event) => onChange({ email: event.target.value })}
        />
      </div>
      <div className="grid-2">
        <TextField
          label="Telefon (valfritt)"
          name="phone"
          type="tel"
          autoComplete="tel"
          value={value.phone ?? ''}
          onChange={(event) => onChange({ phone: event.target.value })}
        />
        <TextField
          label="Gatuadress"
          name="address"
          autoComplete="street-address"
          value={value.address}
          error={errors['customer.address']}
          onChange={(event) => onChange({ address: event.target.value })}
        />
      </div>
      <div className="grid-2">
        <TextField
          label="Postnummer"
          name="postalCode"
          inputMode="numeric"
          autoComplete="postal-code"
          placeholder="123 45"
          value={value.postalCode}
          error={errors['customer.postalCode']}
          onChange={(event) => onChange({ postalCode: event.target.value })}
        />
        <TextField
          label="Ort"
          name="city"
          autoComplete="address-level2"
          value={value.city}
          error={errors['customer.city']}
          onChange={(event) => onChange({ city: event.target.value })}
        />
      </div>
      <TextAreaField
        label={noteLabel ?? 'Meddelande (valfritt)'}
        name="note"
        placeholder={notePlaceholder}
        style={{ minHeight: 90 }}
        value={value.note ?? ''}
        onChange={(event) => onChange({ note: event.target.value })}
      />
    </div>
  );
}
