import { toast as shadcnToast } from '@openrive/ui/components/toast';

/** Shows a short message using the shared shadcn toast primitive. */
export function toast(text: string, ms = 3500) {
  shadcnToast.add({ title: text, timeout: ms });
}
