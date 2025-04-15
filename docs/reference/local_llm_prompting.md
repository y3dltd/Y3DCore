Below are **two** commonly recommended open or permissively-licensed models in the **7B–14B** range, plus a **short prompt template** example you might use with them. I’ve also included some general tips for working with local language models in that parameter range.

---

## Recommended Models in the Up-to-14B Range

1. **Llama 2 13B**

   - Meta’s second-generation LLaMA model, with a 13B parameter variant.
   - Generally stronger than the original LLaMA1 or many 7B variants, especially at reasoning tasks.
   - Available under a custom licence that permits commercial use with some restrictions.
   - Typically uses around 20–24 GB VRAM in 16-bit mode, or less if you quantise (e.g., 8-bit, 4-bit).

2. **MPT-7B/13B (MosaicML)**
   - MosaicML Pretrained Transformer with versions up to 13B.
   - The 13B variant is new and can be used under certain licences depending on which finetune you pick (MPT-13B-Chat, for instance).
   - Good at following instructions if you pick a “chat” or “instruct” finetune.
   - Smaller VRAM footprint for 7B, but 13B obviously has bigger memory needs.

_(**Honourable Mentions**: Falcon 7B/13B, WizardLM 13B, or Guanaco 13B can also be decent, depending on your hardware and the style of instruction fine-tuning you prefer.)_

---

## Prompt Template Example

Below is a **highly condensed** prompt style for your “multi-personalisation eBay notes” scenario. Instead of repeating an entire multi-page set of rules, you can store them in a short “system prompt” or just keep them in one place. Then for each item, you append a short user prompt with the relevant data.

### System Prompt (Stable Instructions)

This can be loaded first, ensuring the model always follows these instructions:

```
System Prompt (Unchanging):
You are an AI assistant extracting personalisation details for 3D printing from a single e-commerce item. Return ONLY valid JSON with the key "personalizations".

Rules:
1) If 'customerNotes' has lines like "Item ID: ... Variation: Color=... Text: ...", each line = 1 object with "customText", "color1", "quantity=1", etc.
2) If only one personalisation or none, just return 1 object with the item’s "quantityOrdered".
3) Format "customText" in Title Case except for 2+ letter acronyms. If note says "(keep caps)", do exactly that.
4) If color is "Navy Blue", map to "Dark Blue" and add "annotation".
5) If something is missing or unknown color, set "needsReview": true.
6) The sum of all "quantity" must match "quantityOrdered", or set "needsReview": true.
7) The final JSON structure:
{
  "personalizations": [
    {
      "customText": "...",
      "color1": "...",
      "color2": "...",
      "quantity": 1,
      "needsReview": false,
      "reviewReason": null,
      "annotation": null
    }
  ]
}
No extra text or disclaimers.
```

### User Prompt (Per Item)

Then for each item you want to process, you feed something like:

```
User Prompt:
## Item Data
{
  "itemId": 1652,
  "quantityOrdered": 6,
  "printSettings": [ ... ],
  "orderContext": {
    "customerNotes": "Personalisation:\nItem ID: 123 Variation: Color=Red\nText: ACCC\nItem ID: 123 Variation: Color=Blue\nText: Buddy"
  }
}

Produce only the JSON as per the system rules.
```

**That’s it.** The system prompt is loaded first (the stable instructions). You append the user prompt with the actual data. The model should then output something like:

```json
{
  "personalizations": [
    {
      "customText": "ACCC",
      "color1": "Red",
      "color2": null,
      "quantity": 1,
      "needsReview": false,
      "reviewReason": null,
      "annotation": null
    },
    {
      "customText": "Buddy",
      "color1": "Blue",
      "color2": null,
      "quantity": 1,
      "needsReview": false,
      "reviewReason": null,
      "annotation": null
    },
    {
      "customText": null,
      "color1": null,
      "color2": null,
      "quantity": 4,
      "needsReview": true,
      "reviewReason": "Quantity mismatch (2 extracted vs. 6 ordered).",
      "annotation": null
    }
  ]
}
```

_(In this example, the final object lumps the “remaining 4” items as “unclear” or “missing instructions,” so it set `needsReview: true`. Exactly how you handle that is up to your logic.)_

---

## Additional Recommendations

1. **Quantisation**: For 13B models, you might run out of VRAM if you only have a 16 GB GPU. Many people quantise to 4-bit (Q4) or 8-bit to fit. Performance can still be good, but test carefully for any accuracy drop.

2. **Temperature, Top-p, Repetition Penalty**: Tweaking generation settings can help your local model stay on track. Typically:

   - Temperature ~ `0.2`–`0.5` for more deterministic compliance.
   - Repetition penalty ~ `1.1`–`1.2` to avoid loops.

3. **Token Limits**: A 13B model typically handles ~2K–4K tokens context window (depending on the model variant). If your data is large, keep your prompt short or break items into multiple calls.

4. **Chain-of-Thought**: Some models may attempt to produce “thinking” steps. To avoid that in the final output, keep emphasising “Return JSON only. No extra text.”

5. **Compare** 7B vs 13B: If your hardware or speed constraints are strong, a well-tuned 7B can be enough for simpler extraction tasks. But 13B is usually more reliable in consistent formatting and following instructions.

---

### TL;DR

- **Llama 2 13B** and **MPT-13B** are good under ~14B.
- Keep instructions short and load them once (system prompt).
- Provide minimal but clear user data.
- Force “Return JSON only.”
- Test your generation settings to ensure stable results.

That’s the recommended approach for your scenario!
