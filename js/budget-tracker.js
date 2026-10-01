(function () {
  "use strict";

  var incomeRows = document.getElementById("income-rows");
  var expenseRows = document.getElementById("expense-rows");
  if (!incomeRows || !expenseRows) return;

  var addIncomeBtn = document.getElementById("add-income-row");
  var addExpenseBtn = document.getElementById("add-expense-row");
  var totalIncomeEl = document.getElementById("total-income");
  var totalExpensesEl = document.getElementById("total-expenses");
  var netTotalEl = document.getElementById("net-total");
  var netLabelEl = document.getElementById("net-label");

  var gasWarningIcon =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 9v4M12 17h.01M10.29 3.86L1.82 18a1 1 0 00.87 1.5h18.62a1 1 0 00.87-1.5L13.71 3.86a1 1 0 00-1.72 0z"/></svg>';
  var gasWarningText = "Gas isn't a fixed expense — it changes every month based on how much you drive. You can still add it if you'd like.";
  var gasKeywords = ["gas", "fuel", "petrol", "diesel"];

  function addRow(container, namePlaceholder, ariaPrefix, isExpense) {
    var index = container.querySelectorAll(".budget-row").length + 1;
    var row = document.createElement("div");
    row.className = "budget-row";
    var nameField = isExpense
      ? '<div class="budget-name-wrap"><input type="text" class="budget-row-name" placeholder="' + namePlaceholder + '" aria-label="' + ariaPrefix + " " + index + ' name" />' +
        '<p class="budget-gas-warning">' + gasWarningIcon + gasWarningText + "</p></div>"
      : '<input type="text" class="budget-row-name" placeholder="' + namePlaceholder + '" aria-label="' + ariaPrefix + " " + index + ' name" />';
    row.innerHTML =
      nameField +
      '<div class="budget-amount-wrap"><span class="budget-currency">$</span>' +
      '<input type="number" inputmode="decimal" class="budget-row-amount" placeholder="0.00" aria-label="' + ariaPrefix + " " + index + ' amount" /></div>';
    container.appendChild(row);
  }

  addIncomeBtn.addEventListener("click", function () {
    addRow(incomeRows, "Source name", "Income source", false);
  });
  addExpenseBtn.addEventListener("click", function () {
    addRow(expenseRows, "Expense name", "Expense", true);
  });

  function isGasExpense(text) {
    var value = text.trim().toLowerCase();
    if (!value) return false;
    return gasKeywords.some(function (keyword) {
      return value.indexOf(keyword) !== -1;
    });
  }

  function checkGasFlag(input) {
    var wrap = input.closest(".budget-name-wrap");
    if (!wrap) return;
    var warning = wrap.querySelector(".budget-gas-warning");
    var flagged = isGasExpense(input.value);
    input.classList.toggle("is-flagged", flagged);
    if (warning) warning.classList.toggle("is-visible", flagged);
  }

  document.addEventListener("input", function (e) {
    if (e.target.classList.contains("budget-row-name") && e.target.closest("#expense-rows")) {
      checkGasFlag(e.target);
    }
  });

  function sum(container) {
    var total = 0;
    container.querySelectorAll(".budget-row-amount").forEach(function (input) {
      var val = parseFloat(input.value);
      if (!isNaN(val)) total += val;
    });
    return total;
  }

  function formatMoney(n) {
    return "$" + n.toFixed(2);
  }

  function updateTotals() {
    var income = sum(incomeRows);
    var expenses = sum(expenseRows);
    var net = income - expenses;

    totalIncomeEl.textContent = formatMoney(income);
    totalExpensesEl.textContent = formatMoney(expenses);
    netTotalEl.textContent = formatMoney(Math.abs(net));
    netTotalEl.classList.toggle("is-positive", net >= 0);
    netTotalEl.classList.toggle("is-negative", net < 0);
    netLabelEl.textContent = net < 0 ? "Net Loss" : "Net Income";
  }

  document.addEventListener("input", function (e) {
    if (e.target.classList.contains("budget-row-amount")) updateTotals();
  });

  function formatAmount(input) {
    if (input.value === "") return;
    var val = parseFloat(input.value);
    if (!isNaN(val)) input.value = val.toFixed(2);
  }

  document.addEventListener(
    "blur",
    function (e) {
      if (e.target.classList && e.target.classList.contains("budget-row-amount")) {
        formatAmount(e.target);
      }
    },
    true
  );

  document.addEventListener("keydown", function (e) {
    if (e.key !== "Enter" || !e.target.classList || !e.target.classList.contains("budget-row-amount")) return;
    e.preventDefault();
    formatAmount(e.target);
    updateTotals();
    var row = e.target.closest(".budget-row");
    var nextRow = row && row.nextElementSibling;
    var nextName = nextRow && nextRow.querySelector(".budget-row-name");
    if (nextName) nextName.focus();
  });

  var printBtn = document.getElementById("print-budget-btn");
  if (printBtn) {
    printBtn.addEventListener("click", function () {
      window.print();
    });
  }

  updateTotals();
})();
