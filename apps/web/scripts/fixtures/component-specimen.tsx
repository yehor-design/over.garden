import { useState } from "react";
import { createRoot } from "react-dom/client";
import { Button } from "../../src/components/ui/button";
import { IconButton } from "../../src/components/ui/icon-button";
import { Input } from "../../src/components/ui/input";
import { Field } from "../../src/components/ui/field";
import { Select } from "../../src/components/ui/select";
import { Tabs } from "../../src/components/ui/tabs";
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "../../src/components/ui/dialog";
import {
  Sheet,
  SheetTrigger,
  SheetContent,
  SheetTitle,
  SheetDescription,
} from "../../src/components/ui/sheet";
import {
  Menu,
  MenuTrigger,
  MenuContent,
  MenuItem,
} from "../../src/components/ui/menu";
import { Toast } from "../../src/components/ui/toast";
import { Skeleton } from "../../src/components/ui/skeleton";
import { EmptyState } from "../../src/components/ui/empty-state";
import {
  HeartIcon,
  MagnifyingGlassIcon,
  NotePencilIcon,
} from "../../src/components/icons";

const COPY = {
  uk: {
    title: "Компоненти OverGarden",
    publish: "Опублікувати спостереження",
    label: "Назва простору",
    error: "Вкажіть назву простору.",
    dialog: "Відкрити діалог",
    sheet: "Відкрити панель",
    menu: "Дії із записом",
    close: "Закрити",
    empty: "Ще немає спостережень",
    first: "Усі записи",
    second: "Збережені записи",
    choose: "Вибрано",
    status: "Спостереження опубліковано",
  },
  bg: {
    title: "Компоненти на OverGarden",
    publish: "Публикуване на наблюдението",
    label: "Име на пространството",
    error: "Въведете име на пространството.",
    dialog: "Отваряне на диалог",
    sheet: "Отваряне на панел",
    menu: "Действия със записа",
    close: "Затваряне",
    empty: "Все още няма наблюдения",
    first: "Всички записи",
    second: "Запазени записи",
    choose: "Избрано",
    status: "Наблюдението е публикувано",
  },
  ru: {
    title: "Компоненты OverGarden",
    publish: "Опубликовать наблюдение",
    label: "Название пространства",
    error: "Укажите название пространства.",
    dialog: "Открыть диалог",
    sheet: "Открыть панель",
    menu: "Действия с записью",
    close: "Закрыть",
    empty: "Наблюдений пока нет",
    first: "Все записи",
    second: "Сохранённые записи",
    choose: "Выбрано",
    status: "Наблюдение опубликовано",
  },
} as const;
const locale = document.documentElement.lang as keyof typeof COPY;
const copy = COPY[locale] ?? COPY.uk;
function Specimen() {
  const [liked, setLiked] = useState(false);
  const [chosen, setChosen] = useState(false);
  return (
    <main className="mx-auto grid max-w-4xl gap-8 p-4 text-text sm:p-8">
      <header>
        <h1 className="text-h1 text-text-heading">{copy.title}</h1>
        <p className="mt-2 text-body-sm text-text-muted">
          Local component specimen · no publication or account mutations
        </p>
      </header>
      <section aria-label="Actions" className="grid gap-4">
        <h2 className="text-h2">Actions</h2>
        {(["primary", "secondary", "subtle", "ghost", "danger"] as const).map(
          (variant) => (
            <div
              key={variant}
              className="flex flex-wrap items-center gap-3"
              data-variant={variant}
            >
              <Button variant={variant}>{copy.publish}</Button>
              <Button variant={variant} disabled>
                {copy.publish}
              </Button>
              <Button variant={variant} loading>
                {copy.publish}
              </Button>
            </div>
          ),
        )}
        <div className="flex flex-wrap items-center gap-4">
          <IconButton
            label={copy.choose}
            aria-pressed={liked}
            onClick={() => setLiked(!liked)}
          >
            <HeartIcon selected={liked} />
          </IconButton>
          {([16, 20, 24] as const).map((size) => (
            <span key={size} data-icon-size={size}>
              <MagnifyingGlassIcon size={size} />
            </span>
          ))}
          <NotePencilIcon />
          <span>16 / 20 / 24</span>
        </div>
      </section>
      <section aria-label="Fields" className="grid gap-4">
        <h2 className="text-h2">Fields</h2>
        <Field label={copy.label} error={copy.error}>
          <Input name="space" required />
        </Field>
        <Field label={copy.label}>
          <Select name="destination">
            <option>Балкон · Томат</option>
            <option>Сад · Томат</option>
          </Select>
        </Field>
        <Input aria-label="Disabled field" disabled value="Disabled" readOnly />
      </section>
      <Tabs
        label="Entries"
        tabs={[
          { id: "all", label: copy.first, content: <p>{copy.first}</p> },
          { id: "saved", label: copy.second, content: <p>{copy.second}</p> },
        ]}
      />
      <section aria-label="Overlays" className="flex flex-wrap gap-3">
        <Dialog>
          <DialogTrigger
            render={<Button variant="secondary" data-testid="dialog-trigger" />}
          >
            {copy.dialog}
          </DialogTrigger>
          <DialogContent closeLabel={copy.close}>
            <DialogTitle>{copy.dialog}</DialogTitle>
            <DialogDescription>{copy.label}</DialogDescription>
            <Field label={copy.label}>
              <Input name="dialog-space" />
            </Field>
          </DialogContent>
        </Dialog>
        <Sheet>
          <SheetTrigger
            render={<Button variant="secondary" data-testid="sheet-trigger" />}
          >
            {copy.sheet}
          </SheetTrigger>
          <SheetContent closeLabel={copy.close} className="p-6">
            <SheetTitle>{copy.sheet}</SheetTitle>
            <SheetDescription>{copy.label}</SheetDescription>
            <Button>{copy.publish}</Button>
          </SheetContent>
        </Sheet>
        <Menu>
          <MenuTrigger
            render={<Button variant="secondary" data-testid="menu-trigger" />}
          >
            {copy.menu}
          </MenuTrigger>
          <MenuContent>
            <MenuItem onClick={() => setChosen(true)}>{copy.choose}</MenuItem>
            <MenuItem disabled>{copy.publish}</MenuItem>
          </MenuContent>
        </Menu>
        {chosen && <p role="status">{copy.choose}</p>}
      </section>
      <Toast title={copy.status} dismissLabel={copy.close} />
      <div aria-label="Loading" aria-busy="true" className="grid gap-3">
        <Skeleton className="h-6 w-2/3" />
        <Skeleton className="h-4 w-full" />
      </div>
      <EmptyState
        title={copy.empty}
        description={copy.publish}
        action={<Button>{copy.publish}</Button>}
      />
    </main>
  );
}
createRoot(document.getElementById("specimen")!).render(<Specimen />);
