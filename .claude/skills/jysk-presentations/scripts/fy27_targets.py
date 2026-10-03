#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""JYSK Ukraine FY27 store KPI targets ("Ключові цілі для магазинів в
Україні на 2027 фінансовий рік"), as given by Adam (district manager,
Kyiv 1) from the official FY27 targets one-pager. Centralized here so
every deck/chart/table colors these metrics against the real company
goal instead of guessing a generic threshold.

Important distinction this file exists to enforce: a column already
named "Index ... plan" (e.g. "Index compl. sales plan") is relative to
a STORE'S OWN monthly plan — 100 is the correct, metric-intrinsic
threshold for that (>=100 = hit plan). The FY27_TARGETS below are a
different thing: the company-wide ANNUAL growth goal for a YoY index
metric (e.g. Sales Growth Comp.Stores target is 108.9%, not 100%).
Use FY27_TARGETS when the question is "are we on track for the FY27
goal", and the generic 100 baseline when the question is "did this
grow at all vs last year" or "did this store hit its own plan".
"""

FY27_TARGETS = {
    # YoY growth INDEX metrics — target is the FY27 goal index, not 100.
    "sales_growth_comp_index": 108.9,      # Sales Growth Comp.Stores - Index
    "sleeping_growth_comp_index": 108.0,   # Acc. Sales Growth within Sleeping % - comp. stores
    "sales_per_customer_growth_index": 111.0,  # Sales/Customer growth % - Total Stores
    "customers_growth_index": 105.0,       # Acc. Customers growth Index - Comparable Stores

    # Raw-number / raw-% metrics — NOT a 100-baseline index, each has its
    # own target with its own direction of "good".
    "stock_adjustment_pct": -0.25,         # Stock adjustment, % of revenue (Storefront).
                                            # Target itself is negative — a small write-off
                                            # is normal and expected. GOOD = actual >= -0.25%
                                            # (closer to/above zero than the goal). BAD = more
                                            # negative than -0.25%. Never treat "any negative
                                            # value" as bad, and never treat "more positive is
                                            # always better" either — this is a ceiling on loss,
                                            # not a floor to maximize.
    "productivity_uah_per_hour": 3250,     # Acc. Productivity, Comparable Stores — грн/год at
                                            # cost-price sales. Higher is better (floor target).
    "staff_turnover_pct_max": 23.0,        # Staff turnover 12 months — ceiling, lower is better.
    "sick_absence_pct_max": 1.0,           # Acc. Sick absence % short term — ceiling, lower is better.
}


def is_good_vs_target(value, target, direction):
    """direction: 'floor' (value >= target is good, e.g. productivity),
    'ceiling' (value <= target is good, e.g. turnover/sick absence), or
    'floor_signed' (same as floor but meant for metrics that can be
    negative, e.g. stock adjustment vs its -0.25% goal — spelled out
    separately only so call sites are self-documenting, behavior is
    identical to 'floor'). Returns None if value is None."""
    if value is None:
        return None
    if direction in ("floor", "floor_signed"):
        return value >= target
    if direction == "ceiling":
        return value <= target
    raise ValueError(f"unknown direction: {direction!r}")
