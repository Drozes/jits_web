"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Avatar, AvatarFallback, AvatarImage, AvatarGroup,
} from "@/components/ui/avatar";
import {
  Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectTrigger, SelectContent, SelectItem, SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle,
  DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
  Sheet, SheetTrigger, SheetContent, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { Settings, Star, User } from "lucide-react";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-6">
      <h2 className="font-heading text-xl uppercase tracking-wider">{title}</h2>
      {children}
    </section>
  );
}

function Showcase({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-3">
      <h3 className="font-heading text-sm uppercase tracking-wide text-muted-foreground">
        {title}
      </h3>
      <div className="rounded-md border bg-card p-6">{children}</div>
    </div>
  );
}

export default function UiKitPage() {
  const [switchOn, setSwitchOn] = useState(false);
  const [checked, setChecked] = useState(false);

  return (
    <div className="mx-auto max-w-4xl space-y-12 p-8">
      <div>
        <h1 className="font-display text-4xl uppercase">UI Kit</h1>
        <p className="mt-1 text-muted-foreground">
          Component showcase for the ELO RATED design system.
        </p>
      </div>

      {/* ACTIONS */}
      <Section title="Actions">
        <Showcase title="Button Variants">
          <div className="flex flex-wrap gap-3">
            <Button variant="default">Default</Button>
            <Button variant="destructive">Destructive</Button>
            <Button variant="outline">Outline</Button>
            <Button variant="secondary">Secondary</Button>
            <Button variant="ghost">Ghost</Button>
            <Button variant="link">Link</Button>
          </div>
        </Showcase>
        <Showcase title="Button Sizes">
          <div className="flex flex-wrap items-center gap-3">
            <Button size="lg">Large</Button>
            <Button size="default">Default</Button>
            <Button size="sm">Small</Button>
            <Button size="icon"><Star className="size-4" /></Button>
          </div>
        </Showcase>
      </Section>

      {/* DATA DISPLAY */}
      <Section title="Data Display">
        <Showcase title="Badge Variants">
          <div className="flex flex-wrap gap-3">
            <Badge variant="default">Default</Badge>
            <Badge variant="secondary">Secondary</Badge>
            <Badge variant="destructive">Destructive</Badge>
            <Badge variant="success">Success</Badge>
            <Badge variant="outline">Outline</Badge>
          </div>
        </Showcase>
        <Showcase title="Avatar Sizes">
          <div className="flex items-center gap-4">
            <Avatar size="sm">
              <AvatarFallback>SM</AvatarFallback>
            </Avatar>
            <Avatar size="default">
              <AvatarImage src="https://github.com/shadcn.png" alt="User" />
              <AvatarFallback>CN</AvatarFallback>
            </Avatar>
            <Avatar size="lg">
              <AvatarFallback>LG</AvatarFallback>
            </Avatar>
          </div>
        </Showcase>
        <Showcase title="Avatar Group">
          <AvatarGroup>
            <Avatar>
              <AvatarFallback>A</AvatarFallback>
            </Avatar>
            <Avatar>
              <AvatarFallback>B</AvatarFallback>
            </Avatar>
            <Avatar>
              <AvatarFallback>C</AvatarFallback>
            </Avatar>
          </AvatarGroup>
        </Showcase>
      </Section>

      {/* LAYOUT */}
      <Section title="Layout">
        <Showcase title="Card (Default)">
          <Card>
            <CardHeader>
              <CardTitle>Session at Downtown BJJ</CardTitle>
              <CardDescription>Open mat, all levels welcome</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm">12 participants checked in.</p>
            </CardContent>
            <CardFooter>
              <Button size="sm">Join Session</Button>
            </CardFooter>
          </Card>
        </Showcase>
        <Showcase title="Card (Interactive)">
          <Card variant="interactive">
            <CardHeader>
              <CardTitle>Fighter Profile</CardTitle>
              <CardDescription>Tap to view details</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="font-mono text-sm tabular-nums">ELO 1247</p>
            </CardContent>
          </Card>
        </Showcase>
        <Showcase title="Separator">
          <div className="space-y-4">
            <p className="text-sm">Content above</p>
            <Separator />
            <p className="text-sm">Content below</p>
            <div className="flex h-6 items-center gap-4">
              <span className="text-sm">Left</span>
              <Separator orientation="vertical" />
              <span className="text-sm">Right</span>
            </div>
          </div>
        </Showcase>
      </Section>

      {/* FORM CONTROLS */}
      <Section title="Form Controls">
        <Showcase title="Input">
          <div className="grid max-w-sm gap-4">
            <Input placeholder="Default input" />
            <div className="space-y-2">
              <Label htmlFor="labeled">With Label</Label>
              <Input id="labeled" placeholder="Enter your name" />
            </div>
            <Input disabled placeholder="Disabled input" />
          </div>
        </Showcase>
        <Showcase title="Select">
          <div className="flex flex-wrap items-center gap-4">
            <Select>
              <SelectTrigger size="default">
                <SelectValue placeholder="Default size" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="light">Lightweight</SelectItem>
                <SelectItem value="middle">Middleweight</SelectItem>
                <SelectItem value="heavy">Heavyweight</SelectItem>
              </SelectContent>
            </Select>
            <Select>
              <SelectTrigger size="sm">
                <SelectValue placeholder="Small" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="m">Male</SelectItem>
                <SelectItem value="f">Female</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </Showcase>
        <Showcase title="Switch">
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2">
              <Switch checked={switchOn} onCheckedChange={setSwitchOn} />
              <Label>Default</Label>
            </div>
            <div className="flex items-center gap-2">
              <Switch size="sm" checked={switchOn} onCheckedChange={setSwitchOn} />
              <Label>Small</Label>
            </div>
          </div>
        </Showcase>
        <Showcase title="Checkbox">
          <div className="flex items-center gap-2">
            <Checkbox
              id="terms"
              checked={checked}
              onCheckedChange={(v) => setChecked(v === true)}
            />
            <Label htmlFor="terms">Accept terms and conditions</Label>
          </div>
        </Showcase>
      </Section>

      {/* FEEDBACK */}
      <Section title="Feedback">
        <Showcase title="Tabs (Default)">
          <Tabs defaultValue="fighters">
            <TabsList>
              <TabsTrigger value="fighters">Fighters</TabsTrigger>
              <TabsTrigger value="gyms">Gyms</TabsTrigger>
            </TabsList>
            <TabsContent value="fighters">
              <p className="py-4 text-sm">Top ranked fighters by ELO.</p>
            </TabsContent>
            <TabsContent value="gyms">
              <p className="py-4 text-sm">Gyms with active sessions.</p>
            </TabsContent>
          </Tabs>
        </Showcase>
        <Showcase title="Tabs (Line Variant)">
          <Tabs defaultValue="overview">
            <TabsList variant="line">
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="stats">Stats</TabsTrigger>
              <TabsTrigger value="history">History</TabsTrigger>
            </TabsList>
            <TabsContent value="overview">
              <p className="py-4 text-sm">Athlete overview and recent activity.</p>
            </TabsContent>
            <TabsContent value="stats">
              <p className="py-4 text-sm">Win/loss record and rating history.</p>
            </TabsContent>
            <TabsContent value="history">
              <p className="py-4 text-sm">Complete match history.</p>
            </TabsContent>
          </Tabs>
        </Showcase>
      </Section>

      {/* OVERLAYS */}
      <Section title="Overlays">
        <Showcase title="Dialog">
          <Dialog>
            <DialogTrigger asChild>
              <Button variant="outline">Open Dialog</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Confirm Match Result</DialogTitle>
                <DialogDescription>
                  Both athletes must confirm the result for ELO to update.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button variant="outline">Cancel</Button>
                <Button>Confirm</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </Showcase>
        <Showcase title="Sheet">
          <div className="flex gap-3">
            <Sheet>
              <SheetTrigger asChild>
                <Button variant="outline">Bottom Sheet</Button>
              </SheetTrigger>
              <SheetContent side="bottom">
                <SheetHeader>
                  <SheetTitle>Match Options</SheetTitle>
                </SheetHeader>
                <p className="p-4 text-sm">Select an action for this match.</p>
              </SheetContent>
            </Sheet>
            <Sheet>
              <SheetTrigger asChild>
                <Button variant="outline">Right Sheet</Button>
              </SheetTrigger>
              <SheetContent side="right">
                <SheetHeader>
                  <SheetTitle>Notifications</SheetTitle>
                </SheetHeader>
                <p className="p-4 text-sm">Your recent notifications.</p>
              </SheetContent>
            </Sheet>
          </div>
        </Showcase>
        <Showcase title="Dropdown Menu">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline">
                <Settings className="size-4" /> Options
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem>
                <User className="mr-2 size-4" /> Profile
              </DropdownMenuItem>
              <DropdownMenuItem>
                <Settings className="mr-2 size-4" /> Settings
              </DropdownMenuItem>
              <DropdownMenuItem className="text-destructive">
                Sign Out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </Showcase>
      </Section>
    </div>
  );
}
