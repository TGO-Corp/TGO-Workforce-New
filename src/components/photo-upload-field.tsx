import { useRef, useState, type ChangeEvent } from "react";
import { Upload } from "lucide-react";
import { toast } from "sonner";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { readAndResizeImage } from "@/lib/image-upload";

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  return (parts[0][0] + (parts[parts.length - 1]?.[0] ?? "")).toUpperCase();
}

/** Same upload-a-photo UI as the Profile page's personalize dialog (a URL
 * field, or a device upload downsized client-side to a data: URI — see
 * @/lib/image-upload) — reused here for the New Hire form and Manage
 * Employees edit dialog's Employee Photo field. */
export function PhotoUploadField({
  id,
  label = "Employee Photo",
  value,
  onChange,
  fallbackName,
}: {
  id: string;
  label?: string;
  value: string;
  onChange: (next: string) => void;
  /** Used for the avatar fallback initials when there's no photo yet. */
  fallbackName: string;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [processing, setProcessing] = useState(false);
  const isUploadedPhoto = value.startsWith("data:");

  async function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // clear so picking the exact same file again still fires onChange
    if (!file) return;
    setProcessing(true);
    try {
      onChange(await readAndResizeImage(file));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't process that image.");
    } finally {
      setProcessing(false);
    }
  }

  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>{label}</Label>
      <div className="flex items-start gap-3">
        <Avatar className="size-14 shrink-0">
          {value && <AvatarImage src={value} alt={fallbackName} />}
          <AvatarFallback>{initials(fallbackName)}</AvatarFallback>
        </Avatar>
        <div className="flex-1 space-y-2">
          <Input
            id={id}
            value={isUploadedPhoto ? "" : value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={
              isUploadedPhoto ? "Uploaded photo — remove it to paste a URL instead" : "https://..."
            }
            disabled={isUploadedPhoto}
          />
          <div className="flex items-center gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleFileChange}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={processing}
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload className="h-3.5 w-3.5" />
              {processing ? "Processing…" : "Upload a file"}
            </Button>
            {value && (
              <Button type="button" variant="ghost" size="sm" onClick={() => onChange("")}>
                Remove
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
