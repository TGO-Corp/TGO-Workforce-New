import { useState } from "react";
import { UserPlus } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { CreatableComboboxField } from "@/components/creatable-combobox-field";
import { Dialog, DialogContent, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { OFFICES, type Employee } from "@/data/employees";
import { useCreateEmployee } from "@/data/employee-store";
import { useListOptionsQuery } from "@/data/list-options-store";
import { useCurrentAccount } from "@/lib/session";

const SOURCE_TYPES = ["Direct Applicant", "Referral", "Rehire", "Internal Transfer"] as const;

export function NewHireDialog({
  onCreated,
}: {
  /** Called with the freshly-created record right after the API confirms
   * it — callers use this to bring the new row into view immediately
   * (reset sort/filters/page) instead of leaving someone to go hunt for it
   * in an alphabetized, possibly-filtered table. */
  onCreated?: (employee: Employee) => void;
} = {}) {
  const [open, setOpen] = useState(false);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [birthday, setBirthday] = useState("");
  const [phone, setPhone] = useState("");
  const [startDate, setStartDate] = useState("");
  const [office, setOffice] = useState("");
  const [sourceType, setSourceType] = useState("");
  const [level, setLevel] = useState("");
  const createMutation = useCreateEmployee();
  const { data: account } = useCurrentAccount();
  const { data: listOptions } = useListOptionsQuery();

  const fullName = [firstName, lastName].filter(Boolean).join(" ");

  function reset() {
    setFirstName("");
    setLastName("");
    setBirthday("");
    setPhone("");
    setStartDate("");
    setOffice("");
    setSourceType("");
    setLevel("");
  }

  async function handleSubmit() {
    if (!fullName) {
      toast.error("Enter at least a first or last name.");
      return;
    }
    if (!startDate) {
      toast.error("Start date is required.");
      return;
    }
    try {
      const created = await createMutation.mutateAsync({
        name: fullName,
        birthday: birthday || undefined,
        phone: phone || undefined,
        startDate,
        office: office || undefined,
        sourceType: sourceType || undefined,
        level: level || undefined,
      });
      setOpen(false);
      toast.success(`New hire submitted: ${fullName}`);
      reset();
      onCreated?.(created);
    } catch (error) {
      console.error(error);
      toast.error("Couldn't submit this new hire. Please try again.");
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) {
          // Pre-fill from the signed-in person's default office (Settings)
          // rather than always starting blank — only when the field hasn't
          // already been touched, so reopening mid-edit doesn't clobber it.
          setOffice((prev) => prev || account?.default_office || "");
        } else {
          reset();
        }
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm">
          <UserPlus className="mr-2 h-4 w-4" /> New Hire Form
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] w-[95vw] overflow-y-auto sm:max-w-2xl">
        <div className="pb-2">
          <h2 className="text-lg font-semibold">New Hire Employee Information Form</h2>
          <p className="text-sm text-muted-foreground">
            Submit onboarding details. Records sync to the directory on approval.
          </p>
        </div>

        <div className="space-y-6 py-2">
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-primary">Basic Information</h3>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="nh-first-name">First Name</Label>
                <Input
                  id="nh-first-name"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="nh-last-name">Last Name</Label>
                <Input
                  id="nh-last-name"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="nh-birthday">Birthday</Label>
                <Input
                  id="nh-birthday"
                  type="date"
                  value={birthday}
                  onChange={(e) => setBirthday(e.target.value)}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="nh-start">Start Date</Label>
                <Input
                  id="nh-start"
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="nh-phone">Phone Number</Label>
                <Input
                  id="nh-phone"
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                />
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-primary">Employment Information</h3>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label>Office</Label>
                <Select value={office} onValueChange={setOffice}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select Office" />
                  </SelectTrigger>
                  <SelectContent>
                    {OFFICES.map((o) => (
                      <SelectItem key={o} value={o}>
                        {o}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label>Source Type</Label>
                <Select value={sourceType} onValueChange={setSourceType}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select Source Type" />
                  </SelectTrigger>
                  <SelectContent>
                    {SOURCE_TYPES.map((s) => (
                      <SelectItem key={s} value={s}>
                        {s}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label>Levels (optional)</Label>
                <CreatableComboboxField
                  label="Level"
                  listKey="levels"
                  options={listOptions?.levels ?? []}
                  value={level}
                  onChange={setLevel}
                  placeholder="Select level"
                />
              </div>
            </div>
          </div>

          <p className="text-xs text-muted-foreground">
            Department and position assignment are handled internally after onboarding.
          </p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={createMutation.isPending}>
            {createMutation.isPending ? "Submitting..." : "Submit New Hire Form"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
