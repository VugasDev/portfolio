---
title: "I Built an AI Trader. It Loses to Buying and Holding."
description: "Everywhere you look, a chatbot plus two tools supposedly turns you into a trader. I wanted to know whether that's even feasible, and measured it honestly: with play money, backtests and an agent I trained myself. The result is clear."
date: 2026-08-16
tags:
  - ki
  - python
  - trading
  - reinforcement-learning
  - backtesting
draft: false
---

> **Up front:** This is an experiment and a side project, not investment advice. No real money
> was involved at any point. All trading happened on a paper-trading account with play money.

## Why I built this

My feed is full of videos following the same pattern: "Connect Claude (or ChatGPT, or Gemini)
to this tool and that data source, and the AI trades for you." Sometimes it supposedly copies
the trades of insiders and politicians, sometimes it reads charts. Almost every one ends with
"Comment SIGNAL and I'll send you the guide". Hardly any of them show evidence of real profits.

I wasn't interested in whether you can get rich this way. I was interested in whether the
claim holds up **technically and measurably** at all. And if you want to know that, it isn't
enough to have a chatbot suggest a few trades and celebrate the winners. You have to set it up
so that you can't fool yourself.

## What a chatbot actually does here

Before building anything, I looked at what happens in these setups:

- **The language model decides nothing a simple rule couldn't.** "Buy what an insider
  bought" is one line of code. The AI writes the justification. It sounds plausible, but it
  isn't analysis that gives you an edge.
- **The data is old.** Members of the US Congress only have to report stock trades up to
  45 days later. By the time you "copy" a trade, it's long since priced in.
- **The returns shown are backtests.** The data providers themselves note that the numbers
  are hypothetical and don't account for costs, slippage or execution.
- **Some platforms trade leveraged derivatives**, not actual shares. None of these videos
  mention the risk.

## How I measured it instead

I set up the experiment more seriously than a chat setup: a system of my own in Python with a
**self-trained** model instead of a language model that only produces text. If even that
finds no edge, there's little reason to believe a chatbot would.

The most important part isn't the model, it's everything around it:

- **One shared simulation for everything.** Backtesting, training and live operation make
  their decisions through the same code. So there's no "great in the backtest, broken live"
  caused by two different implementations.
- **No peeking into the future.** The features the model decides on are guaranteed to be
  computed only from prices that were already known at decision time. This mistake
  (look-ahead) is the most common reason for dream backtests.
- **Costs and slippage** are deducted from every simulated order.
- **A risk manager** checks every order before it goes out and caps the position size.
- **Baseline strategies as the yardstick:** simply buy and hold, a simple momentum rule, and
  a random strategy as the floor.

The actual "AI trader" is a reinforcement learning agent (PPO) that learns by trial and error
in the simulation when to buy, hold or sell.

I tested it on the S&P 500 ETF **SPY** in 15-minute candles from July 2020 to June 2026,
just under 44,000 candles. And **walk-forward**: the model is trained on one period and
evaluated on the immediately following period it has never seen. Eight times in a row, each
with three different random seeds. One test window corresponds to roughly half a trading year.

On top of that there's a live loop that runs via cron against a paper account at the broker
Alpaca: real prices, play money. I checked once that orders arrive there; after that it only
ran in observation mode, with the simple momentum rule as a placeholder.

## The result

Median across all test windows and seeds:

| Strategy | Sharpe ratio | Return per test window |
|---|---|---|
| **Buy and hold** | **0.76** | **+4.9 %** |
| Momentum rule | 0.03 | −0.1 % |
| AI agent (PPO) | −1.19 | −2.8 % |
| Random | −5.44 | −30.5 % |

The Sharpe ratio relates return to risk. Higher is better.

The AI agent only beats random. It loses to the simple rule and to plain buying and holding,
and it was in the red in **seven of eight** test windows. Above all, it learned one thing: to
trade as little as possible. It had the lowest turnover and the smallest drawdown, because it
wasn't invested most of the time.

That isn't a failure of the project; it's exactly the answer I wanted. A self-trained model on
ordinary hardware finds no edge in one of the most liquid markets in the world. The market
itself, simply staying invested in a rising market, beat every strategy that tried to be
smarter. That's why I never connected the agent to the live loop.

## Addendum: Can my test even find an edge?

A negative result has one weak spot: maybe the agent isn't bad, maybe the measurement is
blind. That's why in August I added a **placebo battery**:

- **Null models:** The same buy and sell decisions are shifted in time, or the prices are
  shuffled so that any real structure disappears. Whatever a strategy achieves on this data is
  pure luck. A result only counts if it's clearly better than its placebo.
- **A verdict fixed in code:** The thresholds for "edge" or "no edge" are set before a run
  starts. Moving the threshold afterwards to fit isn't possible.
- **Tests in both directions:** A strategy with a built-in real edge must be detected, and
  pure noise must not get through. Plus a tripwire that fires if future data leaks into the
  features.

A full run of the battery over the entire history takes several hours. That one is still
pending. But it can only confirm the result above, not reverse it: the evaluation is strict
enough that, when in doubt, the answer is "no edge".

## Takeaways

- **"The AI trades for you" doesn't survive an honest measurement**, at least not with what one
  person can build at home. Anyone claiming more should show out-of-sample numbers, not
  hand-picked winning trades.
- **The valuable part is the measurement, not the model.** I learned the most from the
  simulation without future data, the walk-forward evaluation, and the question of how not
  to fool yourself.
- **Buy and hold is a tough opponent.** Every strategy first has to beat the most boring
  option. Mine didn't.

**Stack:** Python with uv, pandas, Parquet cache, gymnasium and stable-baselines3 (PPO),
alpaca-py for market data and paper trading, pytest with more than 130 tests. Running in a
container in the homelab, keys from the password manager.
