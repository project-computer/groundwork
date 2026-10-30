import { useState, type ChangeEvent, type FormEvent } from 'react'
import { Trans, useLingui } from '@lingui/react/macro'
import { Field, NativeSelect, Pill, ReadOnlyNote } from '@/components/vet/fields'
import { useClinic, usePermission } from '@/lib/vet/store'

const TIMEZONES = ['Asia/Bangkok', 'Asia/Ho_Chi_Minh', 'Asia/Vientiane', 'Asia/Phnom_Penh', 'Asia/Yangon', 'Asia/Kuala_Lumpur', 'Asia/Singapore', 'UTC']
const CURRENCIES = ['THB', 'USD', 'EUR', 'LAK', 'VND', 'KHR', 'MMK', 'SGD']

/** Clinic identity tab (2026-10-30 plan, phase C) — moved verbatim from index. */
export const ClinicPanel = () => {
  const { data, dispatch } = useClinic()
  const { t } = useLingui()
  const manage = usePermission('clinic.manage')
  const [name, setName] = useState(data.clinic.name)
  const [timezone, setTimezone] = useState(data.clinic.timezone)
  const [currency, setCurrency] = useState(data.clinic.currency)
  const [vat, setVat] = useState(String(Math.round(data.clinic.vatRate * 1000) / 10))
  const [address, setAddress] = useState(data.clinic.address ?? '')
  const [phone, setPhone] = useState(data.clinic.phone ?? '')
  const [email, setEmail] = useState(data.clinic.email ?? '')
  const [saved, setSaved] = useState(false)

  const vatNumber = Number(vat)
  const vatValid = vat.trim() !== '' && Number.isFinite(vatNumber) && vatNumber >= 0 && vatNumber <= 100
  const valid = name.trim() !== '' && vatValid

  const save = (event: FormEvent) => {
    event.preventDefault()
    if (!valid || !manage.allowed) return
    dispatch({
      type: 'updateClinic',
      patch: {
        name: name.trim(),
        timezone,
        currency,
        vatRate: vatNumber / 100,
        address: address.trim(),
        phone: phone.trim(),
        email: email.trim(),
      },
    })
    setSaved(true)
  }

  const field =
    (setter: (value: string) => void) =>
    (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      setter(e.target.value)
      setSaved(false)
    }

  return (
    <form className="workspace-panel" onSubmit={save}>
      {!manage.allowed && <ReadOnlyNote reason={manage.reason} />}
      <div className="workspace-grid">
        <Field label={t`Clinic name`} htmlFor="clinic-name" className="workspace-wide">
          <input
            id="clinic-name"
            value={name}
            onChange={field(setName)}
            disabled={!manage.allowed}
            placeholder={t`e.g. Baan Sathorn Animal Clinic…`}
            required
          />
        </Field>
        <Field label={t`Timezone`} htmlFor="clinic-timezone">
          <NativeSelect
            id="clinic-timezone"
            value={timezone}
            onChange={(e) => {
              setTimezone(e.target.value)
              setSaved(false)
            }}
            disabled={!manage.allowed}
          >
            {TIMEZONES.map((zone) => (
              <option key={zone} value={zone}>
                {zone}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field label={t`Currency`} htmlFor="clinic-currency">
          <NativeSelect
            id="clinic-currency"
            value={currency}
            onChange={(e) => {
              setCurrency(e.target.value)
              setSaved(false)
            }}
            disabled={!manage.allowed}
          >
            {CURRENCIES.map((code) => (
              <option key={code} value={code}>
                {code}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field label={t`VAT rate (%)`} htmlFor="clinic-vat">
          <input
            id="clinic-vat"
            type="number"
            min="0"
            max="100"
            step="0.1"
            inputMode="decimal"
            value={vat}
            onChange={field(setVat)}
            disabled={!manage.allowed}
            aria-invalid={!vatValid}
          />
        </Field>
        <Field label={t`Phone`} htmlFor="clinic-phone">
          <input
            id="clinic-phone"
            value={phone}
            onChange={field(setPhone)}
            disabled={!manage.allowed}
            autoComplete="off"
            inputMode="tel"
            placeholder={t`e.g. 02 234 5678…`}
          />
        </Field>
        <Field label={t`Email`} htmlFor="clinic-email" className="workspace-wide">
          <input
            id="clinic-email"
            type="email"
            value={email}
            onChange={field(setEmail)}
            disabled={!manage.allowed}
            autoComplete="off"
            placeholder={t`e.g. hello@clinic.vet…`}
          />
        </Field>
        <Field label={t`Address`} htmlFor="clinic-address" className="workspace-wide">
          <textarea
            id="clinic-address"
            rows={2}
            value={address}
            onChange={field(setAddress)}
            disabled={!manage.allowed}
            placeholder={t`Street, district, city, postal code…`}
          />
        </Field>
      </div>
      <div className="workspace-actions">
        <span className="workspace-hint">
          {manage.allowed ? (
            <Trans>Shown across the workspace and on printed documents.</Trans>
          ) : (
            <Trans>Only a clinic admin can change clinic identity.</Trans>
          )}
        </span>
        {saved && manage.allowed && (
          <Pill tone="ok" dot>
            <Trans>Saved locally</Trans>
          </Pill>
        )}
        <button className="button primary" type="submit" disabled={!manage.allowed || !valid || saved}>
          <Trans>Save clinic</Trans>
        </button>
      </div>
    </form>
  )
}
