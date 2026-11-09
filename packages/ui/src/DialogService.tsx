'use client';

import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from './components/alert-dialog';
import { Button } from './components/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './components/dialog';
import { Field, FieldGroup, FieldLabel } from './components/field';
import { Input } from './components/input';

export interface ConfirmDialogOptions {
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
}

export interface PromptDialogOptions {
  title: string;
  description?: string;
  label?: string;
  defaultValue?: string;
  placeholder?: string;
  confirmLabel?: string;
  cancelLabel?: string;
}

type PendingDialog =
  | {
      id: number;
      kind: 'confirm';
      options: ConfirmDialogOptions;
      resolve: (result: boolean) => void;
    }
  | {
      id: number;
      kind: 'prompt';
      options: PromptDialogOptions;
      resolve: (result: string | null) => void;
    };

type DialogRequestHandler = (request: PendingDialog) => void;

let nextRequestId = 0;
let requestHandler: DialogRequestHandler | null = null;

function registerDialogRequestHandler(handler: DialogRequestHandler) {
  requestHandler = handler;
  return () => {
    if (requestHandler === handler) requestHandler = null;
  };
}

export function confirmDialog(options: ConfirmDialogOptions): Promise<boolean> {
  return new Promise((resolve, reject) => {
    if (!requestHandler) {
      reject(new Error('DialogProvider is not mounted.'));
      return;
    }
    requestHandler({ id: nextRequestId++, kind: 'confirm', options, resolve });
  });
}

export function promptDialog(options: PromptDialogOptions): Promise<string | null> {
  return new Promise((resolve, reject) => {
    if (!requestHandler) {
      reject(new Error('DialogProvider is not mounted.'));
      return;
    }
    requestHandler({ id: nextRequestId++, kind: 'prompt', options, resolve });
  });
}

function cancelRequest(request: PendingDialog) {
  if (request.kind === 'confirm') request.resolve(false);
  else request.resolve(null);
}

export function DialogProvider({ children }: { children: ReactNode }) {
  const [requests, setRequests] = useState<PendingDialog[]>([]);
  const [promptDraft, setPromptDraft] = useState<{ id: number; value: string } | null>(null);
  const requestsRef = useRef(requests);
  const active = requests[0] ?? null;
  const confirmRequest = active?.kind === 'confirm' ? active : null;
  const promptRequest = active?.kind === 'prompt' ? active : null;
  const promptValue = promptRequest
    ? promptDraft?.id === promptRequest.id
      ? promptDraft.value
      : promptRequest.options.defaultValue ?? ''
    : '';

  useEffect(() => {
    requestsRef.current = requests;
  }, [requests]);

  useEffect(() => {
    const unregister = registerDialogRequestHandler((request) => {
      setRequests((current) => [...current, request]);
    });

    return () => {
      unregister();
      for (const request of requestsRef.current) cancelRequest(request);
      requestsRef.current = [];
    };
  }, []);

  const finish = useCallback((id: number, result: boolean | string | null) => {
    const current = requestsRef.current;
    const request = current.find((item) => item.id === id);
    if (!request) return;

    if (request.kind === 'confirm') request.resolve(result === true);
    else request.resolve(typeof result === 'string' ? result : null);

    const next = current.filter((item) => item.id !== id);
    requestsRef.current = next;
    setRequests(next);
  }, []);

  const submitPrompt = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (promptRequest) finish(promptRequest.id, promptValue);
  };

  return (
    <>
      {children}
      <AlertDialog
        open={confirmRequest !== null}
        onOpenChange={(open) => {
          if (!open && confirmRequest) finish(confirmRequest.id, false);
        }}
      >
        {confirmRequest && (
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{confirmRequest.options.title}</AlertDialogTitle>
              <AlertDialogDescription>{confirmRequest.options.description}</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={() => finish(confirmRequest.id, false)}>
                {confirmRequest.options.cancelLabel ?? 'Cancel'}
              </AlertDialogCancel>
              <AlertDialogAction
                variant={confirmRequest.options.destructive ? 'destructive' : 'default'}
                onClick={() => finish(confirmRequest.id, true)}
              >
                {confirmRequest.options.confirmLabel ?? 'Continue'}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        )}
      </AlertDialog>

      <Dialog
        open={promptRequest !== null}
        onOpenChange={(open) => {
          if (!open && promptRequest) finish(promptRequest.id, null);
        }}
      >
        {promptRequest && (
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{promptRequest.options.title}</DialogTitle>
              {promptRequest.options.description && <DialogDescription>{promptRequest.options.description}</DialogDescription>}
            </DialogHeader>
            <form onSubmit={submitPrompt} className="grid gap-4">
              <FieldGroup className="gap-3">
                <Field>
                  <FieldLabel htmlFor="openrive-prompt-value">{promptRequest.options.label ?? promptRequest.options.title}</FieldLabel>
                  <Input
                    id="openrive-prompt-value"
                    autoFocus
                    value={promptValue}
                    placeholder={promptRequest.options.placeholder}
                    onChange={(event) => setPromptDraft({ id: promptRequest.id, value: event.target.value })}
                  />
                </Field>
              </FieldGroup>
              <DialogFooter>
                <DialogClose render={<Button variant="outline" type="button" />} onClick={() => finish(promptRequest.id, null)}>
                  {promptRequest.options.cancelLabel ?? 'Cancel'}
                </DialogClose>
                <Button type="submit">{promptRequest.options.confirmLabel ?? 'Save'}</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        )}
      </Dialog>
    </>
  );
}
