const MARKET_TIME_ZONE = "America/New_York";
const CORE_OPEN_MINUTES = 9 * 60 + 30;
const CORE_CLOSE_MINUTES = 16 * 60;
const LOOKAHEAD_DAYS = 21;

function pad(value) {
  return String(value).padStart(2, "0");
}

function isoDate(year, month, day) {
  return `${year}-${pad(month)}-${pad(day)}`;
}

function parseIsoDate(dateString) {
  const [year, month, day] = dateString.split("-").map(Number);
  return { year, month, day };
}

function addDays(dateString, days) {
  const { year, month, day } = parseIsoDate(dateString);
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return isoDate(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
}

function jsWeekday(dateString) {
  const { year, month, day } = parseIsoDate(dateString);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

function nthWeekdayOfMonth(year, month, weekday, nth) {
  const first = new Date(Date.UTC(year, month - 1, 1));
  const firstWeekday = first.getUTCDay();
  const offset = (weekday - firstWeekday + 7) % 7;
  return isoDate(year, month, 1 + offset + (nth - 1) * 7);
}

function lastWeekdayOfMonth(year, month, weekday) {
  const last = new Date(Date.UTC(year, month, 0));
  const lastWeekday = last.getUTCDay();
  const offset = (lastWeekday - weekday + 7) % 7;
  return isoDate(year, month, last.getUTCDate() - offset);
}

function observedFixedHoliday(year, month, day) {
  const actual = isoDate(year, month, day);
  const weekday = jsWeekday(actual);

  if (weekday === 6) return addDays(actual, -1);
  if (weekday === 0) return addDays(actual, 1);
  return actual;
}

// Meeus/Jones/Butcher Gregorian Easter calculation.
function easterSunday(year) {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return isoDate(year, month, day);
}

function marketHolidayMapForYear(year) {
  const holidays = new Map();

  holidays.set(observedFixedHoliday(year, 1, 1), "New Year's Day");
  holidays.set(nthWeekdayOfMonth(year, 1, 1, 3), "Martin Luther King Jr. Day");
  holidays.set(nthWeekdayOfMonth(year, 2, 1, 3), "Washington's Birthday / Presidents Day");
  holidays.set(addDays(easterSunday(year), -2), "Good Friday");
  holidays.set(lastWeekdayOfMonth(year, 5, 1), "Memorial Day");
  holidays.set(observedFixedHoliday(year, 6, 19), "Juneteenth National Independence Day");
  holidays.set(observedFixedHoliday(year, 7, 4), "Independence Day");
  holidays.set(nthWeekdayOfMonth(year, 9, 1, 1), "Labor Day");
  holidays.set(nthWeekdayOfMonth(year, 11, 4, 4), "Thanksgiving Day");
  holidays.set(observedFixedHoliday(year, 12, 25), "Christmas Day");

  return holidays;
}

function getEasternParts(date = new Date()) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: MARKET_TIME_ZONE,
    weekday: "short",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });

  const parts = Object.fromEntries(
    formatter.formatToParts(date)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value])
  );

  const weekdayIndexes = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };

  const year = Number(parts.year);
  const month = Number(parts.month);
  const day = Number(parts.day);
  const hour = Number(parts.hour);
  const minute = Number(parts.minute);
  const second = Number(parts.second);

  return {
    year,
    month,
    day,
    hour,
    minute,
    second,
    weekday: weekdayIndexes[parts.weekday],
    weekdayName: parts.weekday,
    dateString: isoDate(year, month, day),
    minutesSinceMidnight: hour * 60 + minute,
    display: `${isoDate(year, month, day)} ${pad(hour)}:${pad(minute)}:${pad(second)} ET`,
  };
}

function getHolidayName(dateString) {
  const { year } = parseIsoDate(dateString);

  for (const checkYear of [year - 1, year, year + 1]) {
    const holidays = marketHolidayMapForYear(checkYear);
    if (holidays.has(dateString)) {
      return holidays.get(dateString);
    }
  }

  return null;
}

function isRegularTradingDay(dateString) {
  const weekday = jsWeekday(dateString);
  if (weekday === 0 || weekday === 6) {
    return { isTradingDay: false, reason: "Weekend" };
  }

  const holidayName = getHolidayName(dateString);
  if (holidayName) {
    return { isTradingDay: false, reason: holidayName };
  }

  return { isTradingDay: true, reason: "Regular trading day" };
}

function nextRegularOpenFromParts(parts) {
  let candidate = parts.dateString;

  for (let i = 0; i < LOOKAHEAD_DAYS; i += 1) {
    const tradingDay = isRegularTradingDay(candidate);
    const isToday = candidate === parts.dateString;
    const beforeOpenToday = isToday && parts.minutesSinceMidnight < CORE_OPEN_MINUTES;

    if (tradingDay.isTradingDay && (!isToday || beforeOpenToday)) {
      return `${candidate} 09:30 ET`;
    }

    candidate = addDays(candidate, 1);
  }

  return null;
}

export function getMarketStatus(date = new Date()) {
  const ignoreMarketHours = process.env.PAPER_TRADING_IGNORE_MARKET_HOURS === "true";
  const parts = getEasternParts(date);
  const tradingDay = isRegularTradingDay(parts.dateString);

  if (ignoreMarketHours) {
    return {
      isOpen: true,
      canTrade: true,
      reason: "Market-hours gate disabled by PAPER_TRADING_IGNORE_MARKET_HOURS=true.",
      session: "override",
      timeZone: MARKET_TIME_ZONE,
      currentEasternTime: parts.display,
      coreOpen: "09:30 ET",
      coreClose: "16:00 ET",
      nextRegularOpen: null,
    };
  }

  if (!tradingDay.isTradingDay) {
    return {
      isOpen: false,
      canTrade: false,
      reason: `Market closed: ${tradingDay.reason}.`,
      session: "closed",
      timeZone: MARKET_TIME_ZONE,
      currentEasternTime: parts.display,
      coreOpen: "09:30 ET",
      coreClose: "16:00 ET",
      nextRegularOpen: nextRegularOpenFromParts(parts),
    };
  }

  if (parts.minutesSinceMidnight < CORE_OPEN_MINUTES) {
    return {
      isOpen: false,
      canTrade: false,
      reason: "Market closed: before the 9:30 a.m. ET core session.",
      session: "pre-open",
      timeZone: MARKET_TIME_ZONE,
      currentEasternTime: parts.display,
      coreOpen: "09:30 ET",
      coreClose: "16:00 ET",
      nextRegularOpen: `${parts.dateString} 09:30 ET`,
    };
  }

  if (parts.minutesSinceMidnight >= CORE_CLOSE_MINUTES) {
    return {
      isOpen: false,
      canTrade: false,
      reason: "Market closed: after the 4:00 p.m. ET core session.",
      session: "after-close",
      timeZone: MARKET_TIME_ZONE,
      currentEasternTime: parts.display,
      coreOpen: "09:30 ET",
      coreClose: "16:00 ET",
      nextRegularOpen: nextRegularOpenFromParts({ ...parts, dateString: addDays(parts.dateString, 1), minutesSinceMidnight: 0 }),
    };
  }

  return {
    isOpen: true,
    canTrade: true,
    reason: "Market open: inside the regular 9:30 a.m.–4:00 p.m. ET core session.",
    session: "regular",
    timeZone: MARKET_TIME_ZONE,
    currentEasternTime: parts.display,
    coreOpen: "09:30 ET",
    coreClose: "16:00 ET",
    nextRegularOpen: null,
  };
}

export function isMarketOpen(date = new Date()) {
  return getMarketStatus(date).isOpen;
}
