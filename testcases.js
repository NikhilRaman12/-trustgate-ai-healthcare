const testInputs = [
  "high leukocytes count",
  "WBC is 18000 with fever and fatigue",
  "",
  "patient feels normal",
  "blood sugar 250 mg/dL with dizziness"
];

testInputs.forEach((input, i) => {
  console.log(`Test Case ${i+1}:`, input);
  console.log("Result:", runValidation(input));
  console.log("------------");
});