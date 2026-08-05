"use client";

import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  format,
  isSameDay,
  startOfMonth,
  subMonths
} from "date-fns";
import { fr } from "date-fns/locale";
import {
  ChevronLeft,
  ChevronRight,
  Facebook,
  Image as ImageIcon,
  Instagram,
  Video
} from "lucide-react";
import { useMemo, useState } from "react";

export type PublicationStatus =
  | "DRAFT"
  | "PENDING_REVIEW"
  | "APPROVED"
  | "SCHEDULED"
  | "PUBLISHED"
  | "FAILED";

export interface CalendarPublication {
  id: string;
  title: string;
  scheduledAt: Date;
  status: PublicationStatus;
  platform: "INSTAGRAM" | "FACEBOOK";
  format: "IMAGE" | "CAROUSEL" | "REEL" | "STORY";
}

const statusColors: Record<PublicationStatus, string> = {
  DRAFT: "bg-slate-500 text-white",
  PENDING_REVIEW: "bg-amber-500 text-white",
  APPROVED: "bg-emerald-600 text-white",
  SCHEDULED: "bg-blue-600 text-white",
  PUBLISHED: "bg-emerald-700 text-white",
  FAILED: "bg-rose-600 text-white"
};

const statusLabels: Record<PublicationStatus, string> = {
  DRAFT: "Brouillon",
  PENDING_REVIEW: "À réviser",
  APPROVED: "Approuvé",
  SCHEDULED: "Programmé",
  PUBLISHED: "Publié",
  FAILED: "Échec"
};

const formatIcons = {
  IMAGE: ImageIcon,
  CAROUSEL: ImageIcon,
  REEL: Video,
  STORY: Video
};

interface Props {
  publications: CalendarPublication[];
  onSelect?: (pub: CalendarPublication) => void;
  onReschedule?: (pubId: string, newDate: Date) => void;
}

export function EditorialCalendar({ publications, onSelect, onReschedule }: Props) {
  const [currentMonth, setCurrentMonth] = useState(new Date());

  const days = useMemo(() => {
    const start = startOfMonth(currentMonth);
    const end = endOfMonth(currentMonth);
    return eachDayOfInterval({ start, end });
  }, [currentMonth]);

  const pubsByDay = useMemo(() => {
    const map = new Map<string, CalendarPublication[]>();
    publications.forEach((pub) => {
      const key = format(pub.scheduledAt, "yyyy-MM-dd");
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(pub);
    });
    return map;
  }, [publications]);

  const weekDays = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];

  return (
    <div className="w-full overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-200 p-4">
        <h2 className="text-lg font-bold text-slate-900 capitalize">
          {format(currentMonth, "MMMM yyyy", { locale: fr })}
        </h2>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}
            className="rounded-lg p-2 transition-colors hover:bg-slate-100"
          >
            <ChevronLeft className="size-5 text-slate-600" />
          </button>
          <button
            type="button"
            onClick={() => setCurrentMonth(new Date())}
            className="rounded-lg px-3 py-1.5 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-100"
          >
            Aujourd'hui
          </button>
          <button
            type="button"
            onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}
            className="rounded-lg p-2 transition-colors hover:bg-slate-100"
          >
            <ChevronRight className="size-5 text-slate-600" />
          </button>
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-4 border-b border-slate-100 bg-slate-50/50 px-4 py-2 text-xs">
        {Object.entries(statusLabels).map(([status, label]) => (
          <div key={status} className="flex items-center gap-1.5">
            <div
              className={`size-2.5 rounded-full ${statusColors[status as PublicationStatus]}`}
            />
            <span className="font-medium text-slate-600">{label}</span>
          </div>
        ))}
      </div>

      {/* Grid */}
      <div className="grid grid-cols-7 gap-px bg-slate-200">
        {weekDays.map((day) => (
          <div
            key={day}
            className="bg-slate-50 p-2 text-center text-xs font-bold text-slate-500 uppercase tracking-wider"
          >
            {day}
          </div>
        ))}

        {days.map((day) => {
          const key = format(day, "yyyy-MM-dd");
          const dayPubs = pubsByDay.get(key) || [];
          const isToday = isSameDay(day, new Date());

          return (
            <div
              key={key}
              className={`min-h-[120px] bg-white p-2 transition-colors ${
                isToday ? "bg-rose-50/40" : ""
              } hover:bg-slate-50/80`}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const pubId = e.dataTransfer.getData("pubId");
                if (pubId && onReschedule) onReschedule(pubId, day);
              }}
            >
              <div
                className={`mb-1 text-xs font-bold ${
                  isToday ? "text-rose-600" : "text-slate-700"
                }`}
              >
                {format(day, "d")}
              </div>
              <div className="space-y-1">
                {dayPubs.map((pub) => {
                  const Icon = formatIcons[pub.format] || ImageIcon;
                  return (
                    <div
                      key={pub.id}
                      draggable
                      onDragStart={(e) => {
                        e.dataTransfer.setData("pubId", pub.id);
                      }}
                      onClick={() => onSelect?.(pub)}
                      className={`flex cursor-pointer items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-semibold shadow-2xs transition-opacity hover:opacity-90 ${
                        statusColors[pub.status]
                      }`}
                    >
                      <Icon className="size-3.5 shrink-0" />
                      <span className="truncate flex-1">{pub.title}</span>
                      {pub.platform === "INSTAGRAM" ? (
                        <Instagram className="size-3 shrink-0 opacity-80" />
                      ) : (
                        <Facebook className="size-3 shrink-0 opacity-80" />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
