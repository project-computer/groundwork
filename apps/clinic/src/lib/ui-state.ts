'use client'

import useSWR, { mutate } from 'swr'

const PRINT_KEY = 'vetdesk:ui:print'
const CONSULT_KEY = 'vetdesk:ui:consult'
const HISTORY_KEY = 'vetdesk:ui:history'

function useUiValue<T>(key: string): T | null {
  const { data } = useSWR<T | null>(key, null, { fallbackData: null })
  return data ?? null
}

function setUiValue<T>(key: string, value: T | null) {
  mutate(key, value, { revalidate: false })
}

export type PrintKind = 'prescription' | 'visit' | 'invoice' | 'appointment'

/** `id` is a medical record id, except for `appointment` where it is an appointment id. */
export interface PrintJob {
  kind: PrintKind
  id: string
}

export const usePrintJob = () => useUiValue<PrintJob>(PRINT_KEY)
export const printDocument = (job: PrintJob) => setUiValue(PRINT_KEY, { ...job })
export const clearPrintJob = () => setUiValue(PRINT_KEY, null)

export const useConsultId = () => useUiValue<string>(CONSULT_KEY)
export function openConsult(recordId: string) {
  setUiValue(HISTORY_KEY, null)
  setUiValue(CONSULT_KEY, recordId)
}
export const closeConsult = () => setUiValue(CONSULT_KEY, null)

export const useHistoryPatientId = () => useUiValue<string>(HISTORY_KEY)
export const openPatientHistory = (patientId: string) => setUiValue(HISTORY_KEY, patientId)
export const closePatientHistory = () => setUiValue(HISTORY_KEY, null)
