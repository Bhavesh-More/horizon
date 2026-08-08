import React from "react";
import * as AlertDialog from "@radix-ui/react-alert-dialog";
import { Trash2, AlertTriangle, File } from "lucide-react";
import { SafetyTagPill, SafetyTier } from "./SafetyTagPill";

export interface ConfirmationModalItem {
  id: number | string;
  name: string;
  path: string;
  sizeFormatted: string;
  safetyTier: SafetyTier;
}

export interface ConfirmationModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: string;
  description?: string;
  items: ConfirmationModalItem[];
  totalBytesFormatted: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel?: () => void;
  isLoading?: boolean;
}

export const ConfirmationModal = React.memo(function ConfirmationModal({
  open,
  onOpenChange,
  title = "Move Files to Trash?",
  description = "The following files will be moved to your operating system trash bin. This action can be undone from Trash.",
  items,
  totalBytesFormatted,
  confirmLabel = "Move to Trash",
  cancelLabel = "Cancel",
  onConfirm,
  onCancel,
  isLoading = false,
}: ConfirmationModalProps) {
  const handleCancel = () => {
    if (onCancel) onCancel();
    onOpenChange(false);
  };

  const handleConfirm = () => {
    onConfirm();
  };

  return (
    <AlertDialog.Root open={open} onOpenChange={onOpenChange}>
      <AlertDialog.Portal>
        <AlertDialog.Overlay className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs transition-opacity" />
        <AlertDialog.Content className="fixed top-[50%] left-[50%] z-50 flex max-h-[85vh] w-[560px] translate-x-[-50%] translate-y-[-50%] flex-col rounded-lg border border-border bg-surface-overlay p-6 shadow-2xl focus:outline-hidden">
          {/* Header */}
          <div className="flex items-start gap-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-tag-check-bg text-tag-check-text">
              <Trash2 className="h-5 w-5" aria-hidden="true" />
            </div>
            <div className="flex-1">
              <AlertDialog.Title className="text-title font-rounded text-text-primary">
                {title}
              </AlertDialog.Title>
              <AlertDialog.Description className="mt-1 text-row text-text-secondary">
                {description}
              </AlertDialog.Description>
            </div>
          </div>

          {/* Reclaimable summary banner */}
          <div className="mt-4 flex items-center justify-between rounded-md border border-border bg-surface-secondary px-3.5 py-2.5">
            <span className="text-row font-medium text-text-secondary">
              Selected ({items.length} {items.length === 1 ? "item" : "items"})
            </span>
            <span className="text-row font-semibold text-text-primary">
              {totalBytesFormatted} to reclaim
            </span>
          </div>

          {/* Items Preview List */}
          <div className="mt-3 max-h-[220px] overflow-y-auto rounded-md border border-border bg-surface divide-y divide-border">
            {items.map((item) => (
              <div
                key={item.id}
                className="flex items-center justify-between px-3.5 py-2 text-row hover:bg-surface-secondary transition-colors"
              >
                <div className="flex min-w-0 flex-1 items-center gap-2.5 pr-3">
                  <File className="h-4 w-4 shrink-0 text-text-tertiary" aria-hidden="true" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-text-primary">{item.name}</p>
                    <p className="truncate text-meta text-text-tertiary">{item.path}</p>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <SafetyTagPill tier={item.safetyTier} />
                  <span className="text-meta font-medium text-text-secondary">
                    {item.sizeFormatted}
                  </span>
                </div>
              </div>
            ))}
          </div>

          {/* OS Trash Invariant guidance */}
          <p className="mt-4 text-meta text-text-tertiary">
            Files will be moved to your operating system Trash. You can inspect or restore them at any time before emptying the Trash.
          </p>

          {/* Action Buttons */}
          <div className="mt-6 flex items-center justify-end gap-3">
            <AlertDialog.Cancel asChild>
              <button
                type="button"
                onClick={handleCancel}
                disabled={isLoading}
                className="rounded-sm border border-btn-secondary-border bg-surface px-4 py-2 text-row font-medium text-text-primary transition-colors hover:bg-surface-secondary focus:outline-hidden disabled:opacity-50"
              >
                {cancelLabel}
              </button>
            </AlertDialog.Cancel>
            <AlertDialog.Action asChild>
              <button
                type="button"
                onClick={handleConfirm}
                disabled={isLoading}
                className="flex items-center gap-2 rounded-sm bg-btn-primary-bg px-4 py-2 text-row font-medium text-btn-primary-text transition-opacity hover:opacity-90 focus:outline-hidden disabled:opacity-50"
              >
                {isLoading ? (
                  <span>Moving to Trash...</span>
                ) : (
                  <>
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                    <span>{confirmLabel}</span>
                  </>
                )}
              </button>
            </AlertDialog.Action>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
});
