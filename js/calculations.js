// js/calculations.js
// Pure math for the shift totals shown in the "Calculations" cards.
// No DOM access here on purpose — app.js reads the numbers back and writes
// them into the page, so this file can be unit-tested on its own later.
// Exposes DD.calc = { FEE_TIERS, FEE_RATES, computeTotals(entries) }
(function () {
  window.DD = window.DD || {};

  // Delivery-fee tiers offered on the form, and what the driver is paid per
  // delivery at each tier.
  const FEE_TIERS = ["2.25", "4.00", "5.00", "6.00", "7.00", "8.00"];
  const FEE_RATES = {
    "2.25": 1.50,
    "4.00": 3.25,
    "5.00": 4.25,
    "6.00": 5.25,
    "7.00": 6.25,
    "8.00": 7.25,
  };

  function sum(nums) {
    return nums.reduce((a, b) => a + b, 0);
  }

  // entry shape:
  //   { street, orderType, total, tip, fee,
  //     cashTip,             // true: the WHOLE tip was handed over in cash
  //     partialCashTip,      // true: only PART of the tip was cash
  //     partialCashAmount }  // that cash part, as a "x.xx" string
  //
  // How much of a single entry's tip the driver is already holding in cash
  // (0 for a tip paid entirely on the card).
  function cashPortionOfTip(e) {
    const tip = parseFloat(e.tip) || 0;
    if (e.cashTip) return tip;
    if (e.partialCashTip) {
      const cashAmt = parseFloat(e.partialCashAmount) || 0;
      return Math.min(cashAmt, tip); // never more than the tip itself
    }
    return 0;
  }

  // What the customer actually paid for the ORDER, as tracked in Stats'
  // "Order Total" — not inflated by any tip that ended up charged to
  // their card. Cash orders are exactly what's on the slip already. A
  // phone/online CC order's printed total often already has the tip
  // baked in (not every slip breaks out a separate subtotal line), so
  // back out whatever portion of that tip actually landed on the card.
  // Any part of the tip paid in cash was never added to that printed
  // total in the first place, so it's left alone either way — including
  // a CC order whose ENTIRE tip was handed over in cash, where nothing
  // gets deducted at all.
  function correctedOrderTotal(e) {
    const total = parseFloat(e.total) || 0;
    if (e.orderType !== "phone_cc" && e.orderType !== "online_cc") return total;
    const tip = parseFloat(e.tip) || 0;
    const ccTipPortion = tip - cashPortionOfTip(e);
    return total - ccTipPortion;
  }

  function computeTotals(entries) {
    const counts = {};
    const values = {};
    let totalDeliveries = 0;
    let totalValueOfFees = 0;

    FEE_TIERS.forEach((tier) => {
      const count = entries.filter((e) => e.fee === tier).length;
      const value = count * FEE_RATES[tier];
      counts[tier] = count;
      values[tier] = value;
      totalDeliveries += count;
      totalValueOfFees += value;
    });

    // CC Gratuity: the part of a card order's tip NOT already in the
    // driver's hand as cash — that's what the house owes back.
    const ccGratuity = sum(
      entries
        .filter((e) => e.orderType === "phone_cc" || e.orderType === "online_cc")
        .map((e) => (parseFloat(e.tip) || 0) - cashPortionOfTip(e))
    );
    const deliveryFeeTotal = totalValueOfFees;
    const totalFromHouse = ccGratuity + deliveryFeeTotal;

    // Cash Gratuity: every dollar of tip the driver is already holding in
    // cash — full cash-order tips, cash-tip card orders, and the cash
    // slice of a partial-cash-tip card order.
    const cashGratuity = sum(entries.map((e) => cashPortionOfTip(e)));
    const nightTotal = totalFromHouse + cashGratuity;

    const totalCashOwed = sum(
      entries.filter((e) => e.orderType === "cash").map((e) => parseFloat(e.total) || 0)
    );

    return {
      counts,
      values,
      totalDeliveries,
      totalValueOfFees,
      ccGratuity,
      deliveryFeeTotal,
      totalFromHouse,
      cashGratuity,
      nightTotal,
      totalCashOwed,
    };
  }

  window.DD.calc = { FEE_TIERS, FEE_RATES, computeTotals, cashPortionOfTip, correctedOrderTotal };
})();
