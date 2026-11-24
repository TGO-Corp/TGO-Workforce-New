import { useState } from "react";
import { Briefcase, Landmark, Phone as PhoneIcon, User, UserPlus } from "lucide-react";
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
import { EMPLOYMENT_TYPES, OFFICES, WORK_ARRANGEMENTS, type Employee } from "@/data/employees";
import { useCreateEmployee } from "@/data/employee-store";
import { useListOptionsQuery } from "@/data/list-options-store";
import { useCurrentAccount } from "@/lib/session";

const SOURCE_TYPES = ["Direct Applicant", "Referral", "Rehire", "Internal Transfer"] as const;

/** A section heading matching the grouped-fields layout shared with
 * EditEmployeeDialog (manage-employees-dialog.tsx) — Personal/Employment/
 * Company Accounts/Emergency Contact. */
function SectionHeading({ icon: Icon, label }: { icon: typeof User; label: string }) {
  return (
    <h3 className="flex items-center gap-2 text-sm font-semibold text-primary">
      <Icon className="h-4 w-4" /> {label}
    </h3>
  );
}

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
  const [preferredName, setPreferredName] = useState("");
  const [birthday, setBirthday] = useState("");
  const [phone, setPhone] = useState("");
  const [personalEmail, setPersonalEmail] = useState("");
  const [address, setAddress] = useState("");
  const [startDate, setStartDate] = useState("");
  const [office, setOffice] = useState("");
  const [sourceType, setSourceType] = useState("");
  const [level, setLevel] = useState("");
  const [employmentType, setEmploymentType] = useState("");
  const [workArrangement, setWorkArrangement] = useState("");
  const [supervisor, setSupervisor] = useState("");
  const [tgoEmail, setTgoEmail] = useState("");
  const [lmsEmail, setLmsEmail] = useState("");
  const [vonageExtension, setVonageExtension] = useState("");
  const [emergencyContactName, setEmergencyContactName] = useState("");
  const [emergencyContactRelationship, setEmergencyContactRelationship] = useState("");
  const [emergencyContactNumber, setEmergencyContactNumber] = useState("");
  const createMutation = useCreateEmployee();
  const { data: account } = useCurrentAccount();
  const { data: listOptions } = useListOptionsQuery();

  const fullName = [firstName, lastName].filter(Boolean).join(" ");

  function reset() {
    setFirstName("");
    setLastName("");
    setPreferredName("");
    setBirthday("");
    setPhone("");
    setPersonalEmail("");
    setAddress("");
    setStartDate("");
    setOffice("");
    setSourceType("");
    setLevel("");
    setEmploymentType("");
    setWorkArrangement("");
    setSupervisor("");
    setTgoEmail("");
    setLmsEmail("");
    setVonageExtension("");
    setEmergencyContactName("");
    setEmergencyContactRelationship("");
    setEmergencyContactNumber("");
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
        preferredName: preferredName || undefined,
        birthday: birthday || undefined,
        phone: phone || undefined,
        personalEmail: personalEmail || undefined,
        address: address || undefined,
        startDate,
        office: office || undefined,
        sourceType: sourceType || undefined,
        level: level || undefined,
        employmentType: employmentType || undefined,
        workArrangement: workArrangement || undefined,
        supervisor: supervisor || undefined,
        tgoEmail: tgoEmail || undefined,
        lmsEmail: lmsEmail || undefined,
        vonageExtension: vonageExtension || undefined,
        emergencyContactName: emergencyContactName || undefined,
        emergencyContactRelationship: emergencyContactRelationship || undefined,
        emergencyContactNumber: emergencyContactNumber || undefined,
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
            <SectionHeading icon={User} label="Personal Information" />
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
                <Label htmlFor="nh-preferred-name">Preferred Name / Nickname</Label>
                <Input
                  id="nh-preferred-name"
                  value={preferredName}
                  onChange={(e) => setPreferredName(e.target.value)}
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
                <Label htmlFor="nh-phone">Phone Number</Label>
                <Input
                  id="nh-phone"
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="nh-personal-email">Personal Email</Label>
                <Input
                  id="nh-personal-email"
                  type="email"
                  value={personalEmail}
                  onChange={(e) => setPersonalEmail(e.target.value)}
                />
              </div>
              <div className="grid gap-2 sm:col-span-2">
                <Label htmlFor="nh-address">Residential Address</Label>
                <Input
                  id="nh-address"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                />
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <SectionHeading icon={Briefcase} label="Employment Information" />
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
                <Label>Employment Type (optional)</Label>
                <Select value={employmentType} onValueChange={setEmploymentType}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select employment type" />
                  </SelectTrigger>
                  <SelectContent>
                    {EMPLOYMENT_TYPES.map((t) => (
                      <SelectItem key={t} value={t}>
                        {t}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label>Work Arrangement (optional)</Label>
                <Select value={workArrangement} onValueChange={setWorkArrangement}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select work arrangement" />
                  </SelectTrigger>
                  <SelectContent>
                    {WORK_ARRANGEMENTS.map((w) => (
                      <SelectItem key={w} value={w}>
                        {w}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2 sm:col-span-2">
                <Label htmlFor="nh-supervisor">Direct Supervisor / Manager</Label>
                <Input
                  id="nh-supervisor"
                  value={supervisor}
                  onChange={(e) => setSupervisor(e.target.value)}
                />
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <SectionHeading icon={Landmark} label="Company Accounts" />
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="nh-tgo-email">TGO Email Address</Label>
                <Input
                  id="nh-tgo-email"
                  type="email"
                  value={tgoEmail}
                  onChange={(e) => setTgoEmail(e.target.value)}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="nh-lms-email">LMS Email Address (if applicable)</Label>
                <Input
                  id="nh-lms-email"
                  type="email"
                  value={lmsEmail}
                  onChange={(e) => setLmsEmail(e.target.value)}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="nh-vonage">Vonage Extension</Label>
                <Input
                  id="nh-vonage"
                  value={vonageExtension}
                  onChange={(e) => setVonageExtension(e.target.value)}
                />
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <SectionHeading icon={PhoneIcon} label="Emergency Contact" />
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="nh-ec-name">Emergency Contact Name</Label>
                <Input
                  id="nh-ec-name"
                  value={emergencyContactName}
                  onChange={(e) => setEmergencyContactName(e.target.value)}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="nh-ec-relationship">Relationship</Label>
                <Input
                  id="nh-ec-relationship"
                  value={emergencyContactRelationship}
                  onChange={(e) => setEmergencyContactRelationship(e.target.value)}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="nh-ec-number">Emergency Contact Number</Label>
                <Input
                  id="nh-ec-number"
                  type="tel"
                  value={emergencyContactNumber}
                  onChange={(e) => setEmergencyContactNumber(e.target.value)}
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
