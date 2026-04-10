"""
sentence_builder.py
Converts sign language word sequences into natural English sentences.

Two-tier approach:
  1. PRIMARY  — Claude API for natural, context-aware output
  2. FALLBACK — local rule-based system if API key missing or unavailable
"""

import os
import time
import json
import urllib.request
import urllib.error

# ── Load API key from .env file if present ────────────────────────────────────
def _load_env():
    env_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".env")
    if os.path.exists(env_path):
        with open(env_path, encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith("#") and "=" in line:
                    key, _, val = line.partition("=")
                    os.environ.setdefault(key.strip(), val.strip())

_load_env()

API_URL = "https://api.anthropic.com/v1/messages"
MODEL = os.environ.get("ANTHROPIC_MODEL", "claude-3-5-haiku-latest")
API_KEY = os.environ.get("ANTHROPIC_API_KEY", "")
API_TIMEOUT = float(os.environ.get("ANTHROPIC_TIMEOUT", "4.0"))

SYSTEM_PROMPT = """You are a sign language interpreter.
You receive a sequence of words in Sign Language Order (raw concepts only).
Convert them into ONE natural, grammatically correct English sentence.

Strict rules:
- Output ONLY the final sentence. No explanation, no quotes, no alternatives.
- End with exactly one punctuation mark: . or ? or !
- Use present continuous for action verbs unless another tense is clearly implied.
- For feelings/states: "I am [feeling]."
- For wh-questions: proper question form with ?
- For yes/no questions: proper question form with ?
- Keep it concise.
"""

# Optional token normalization from ML/frontend noise
NORMALIZE_MAP = {
    "your": "you",
    "u": "you",
    "pls": "please",
    "thx": "thanks",
}

# allowed signs (strict vocabulary)
ALLOWED_SIGNS = {
    "again", "angry", "bad", "bye", "clear", "come", "drink", "eat", "family", "friend",
    "go", "good", "he", "hear", "hello", "help", "home", "how", "hurt", "i", "me", "morning",
    "name", "no", "phone", "please", "problem", "ready", "sad", "see", "sleep", "sorry",
    "speak", "stop", "thanks", "time", "together", "understand", "want", "water", "what",
    "when", "where", "which", "who", "why", "work", "yes", "you",
}

def normalize_sign(sign: str) -> str:
    s = sign.lower().strip()
    s = NORMALIZE_MAP.get(s, s)
    return s


def _call_claude_api(words: list) -> str | None:
    """Call Claude API. Returns sentence string or None on failure."""
    if not API_KEY or API_KEY.startswith("sk-ant-YOUR"):
        return None

    payload = json.dumps({
        "model": MODEL,
        "max_tokens": 80,
        "system": SYSTEM_PROMPT,
        "messages": [{"role": "user", "content": " ".join(words)}]
    }).encode("utf-8")

    req = urllib.request.Request(
        API_URL,
        data=payload,
        method="POST",
        headers={
            "Content-Type": "application/json",
            "anthropic-version": "2023-06-01",
            "x-api-key": API_KEY,
        },
    )

    for _ in range(2):  # one retry
        try:
            with urllib.request.urlopen(req, timeout=API_TIMEOUT) as resp:
                data = json.loads(resp.read().decode("utf-8"))
                sentence = data["content"][0]["text"].strip()
                if sentence and len(sentence) < 250:
                    return sentence
        except urllib.error.HTTPError:
            break
        except Exception:
            time.sleep(0.2)
    return None


# ── Local rule-based fallback ─────────────────────────────────────────────────

CONTINUOUS_VERBS = {
    "go", "eat", "drink", "sleep", "work", "speak", "come",
    "help", "see", "hear", "understand", "stop",
}
TO_VERBS = {
    "go", "eat", "drink", "sleep", "work", "speak", "come",
    "help", "see", "hear", "understand",
}
SUBJECTS = {"i", "me", "you", "he", "she", "we", "they"}
QUESTION_WORDS = {"what", "where", "who", "why", "when", "how", "which"}
ADJECTIVES = {"good", "bad", "sad", "angry", "sorry", "hurt", "ready", "clear", "again"}
BE_VERB = {
    "i": "am", "me": "am", "you": "are", "he": "is", "she": "is",
    "we": "are", "they": "are"
}

WORD_MAP = {
    "i": "I", "me": "I", "you": "you", "he": "he", "we": "we",
    "again": "again", "angry": "angry", "bad": "bad", "bye": "goodbye",
    "clear": "clear", "come": "come", "drink": "drink", "eat": "eat",
    "family": "family", "friend": "friend", "go": "go", "good": "good",
    "hear": "hear", "hello": "hello", "help": "help", "home": "home",
    "how": "how", "hurt": "hurt", "morning": "morning", "name": "name",
    "no": "no", "phone": "phone", "please": "please", "problem": "problem",
    "ready": "ready", "sad": "sad", "see": "see", "sleep": "sleep",
    "sorry": "sorry", "speak": "speak", "stop": "stop", "thanks": "thank you",
    "time": "time", "together": "together", "understand": "understand",
    "want": "want", "water": "water", "what": "what", "when": "when",
    "where": "where", "which": "which", "who": "who", "why": "why",
    "work": "work", "yes": "yes",
}

PHRASE_PATTERNS = {
    ("hello",): "Hello!",
    ("bye",): "Goodbye!",
    ("thanks",): "Thank you.",
    ("sorry",): "I am sorry.",
    ("stop",): "Stop!",
    ("help",): "Help!",
    ("yes",): "Yes.",
    ("no",): "No.",
    ("again",): "Please say that again.",
    ("clear",): "Please speak clearly.",
    ("ready",): "I am ready.",
    ("morning",): "Good morning!",
    ("hello", "how", "you"): "Hello! How are you?",
    ("good", "morning"): "Good morning!",
    ("i", "go", "home"): "I am going home.",
    ("i", "go", "work"): "I am going to work.",
    ("i", "eat"): "I am eating.",
    ("i", "drink", "water"): "I am drinking water.",
    ("i", "no", "understand"): "I do not understand.",
    ("you", "understand"): "Do you understand?",
    ("where", "you", "go"): "Where are you going?",
    ("what", "you", "name"): "What is your name?",
    ("no", "problem"): "No problem.",
}

def _make_continuous(verb: str) -> str:
    if verb.endswith("ing"):
        return verb
    if verb.endswith("e") and not verb.endswith("ee"):
        return verb[:-1] + "ing"
    if (
        len(verb) >= 3
        and verb[-1] not in "aeiou"
        and verb[-2] in "aeiou"
        and verb[-3] not in "aeiou"
    ):
        return verb + verb[-1] + "ing"
    return verb + "ing"

def _rule_based_grammar(signs: list) -> str:
    if not signs:
        return ""
    words = [normalize_sign(w) for w in signs if w and w.strip()]
    words = [w for w in words if w in ALLOWED_SIGNS]
    if not words:
        return ""

    if len(words) == 1:
        singles = {
            "hello": "Hello!", "bye": "Goodbye!", "thanks": "Thank you.",
            "sorry": "I am sorry.", "stop": "Stop!", "help": "Help!",
            "yes": "Yes.", "no": "No.", "again": "Please say that again.",
            "clear": "Please speak clearly.", "ready": "I am ready.",
            "morning": "Good morning!", "water": "I want some water.",
            "phone": "I need my phone.", "together": "Let us stay together.",
            "understand": "I understand.", "work": "I am working.",
            "home": "I am going home.", "family": "My family.",
            "friend": "My friend.", "time": "What time is it?",
            "good": "Good.", "bad": "That is bad.", "name": "My name is...",
        }
        return singles.get(words[0], WORD_MAP.get(words[0], words[0]).capitalize() + ".")

    # Longest phrase match
    for length in range(min(7, len(words)), 0, -1):
        for start in range(len(words) - length + 1):
            pattern = tuple(words[start:start + length])
            if pattern in PHRASE_PATTERNS:
                result = PHRASE_PATTERNS[pattern]
                remaining = words[start + length:]
                if remaining:
                    extra = " ".join(WORD_MAP.get(w, w) for w in remaining)
                    result = result.rstrip("?!. ") + " " + extra + "."
                return result

    # Generic builder
    result = []
    i = 0
    subject = None
    has_be = False

    while i < len(words):
        word = words[i]
        mapped = WORD_MAP.get(word, word)

        if word in SUBJECTS and subject is None:
            subject = word
            result.append("I" if word in ("i", "me") else mapped)
            i += 1
            continue

        if word in QUESTION_WORDS and i == 0:
            result.append(mapped.capitalize())
            if i + 1 < len(words) and words[i + 1] in SUBJECTS:
                subj = words[i + 1]
                result.append(BE_VERB.get(subj, "are"))
                result.append(WORD_MAP.get(subj, subj))
                i += 2
                continue
            i += 1
            continue

        if subject and word in ADJECTIVES and not has_be:
            result.append(BE_VERB.get(subject, "am"))
            result.append(mapped)
            has_be = True
            i += 1
            continue

        if subject and word in CONTINUOUS_VERBS and not has_be:
            result.append(BE_VERB.get(subject, "am"))
            result.append(_make_continuous(mapped))
            has_be = True
            i += 1
            continue

        if word == "want" and i + 1 < len(words):
            nxt = words[i + 1]
            if nxt in TO_VERBS:
                result.append("want to")
                result.append(WORD_MAP.get(nxt, nxt))
                i += 2
                continue

        if word in ("no", "not") and i + 1 < len(words):
            nxt = words[i + 1]
            if subject:
                if subject == "he":
                    result.append("does not")
                elif subject in ("i", "me", "you"):
                    result.append("do not")
                else:
                    result.append("do not")
            else:
                result.append("not")
            result.append(WORD_MAP.get(nxt, nxt))
            i += 2
            continue

        if word == "water":
            result.append("water")
        elif word == "phone":
            result.append("phone")
        elif word == "family":
            result.append("family")
        elif word == "friend":
            result.append("friend")
        else:
            result.append(mapped)

        i += 1

    sentence = " ".join(result).strip()
    if not sentence:
        return ""
    sentence = sentence[0].upper() + sentence[1:]

    is_question = (
        words[0] in QUESTION_WORDS
        or (words[0] == "you" and len(words) <= 3)
    )

    if sentence.endswith(("?", "!", ".")):
        return sentence
    return sentence + ("?" if is_question else ".")


def correct_grammar(signs: list) -> str:
    if not signs:
        return ""

    cleaned = [normalize_sign(s) for s in signs if s and s.strip()]
    cleaned = [s for s in cleaned if s in ALLOWED_SIGNS]
    if not cleaned:
        return ""

    api_result = _call_claude_api(cleaned)
    if api_result:
        print(f"[API]   {cleaned} → {api_result}")
        return api_result

    local_result = _rule_based_grammar(cleaned)
    print(f"[LOCAL] {cleaned} → {local_result}")
    return local_result


class SentenceBuilder:
    """
    Collects confirmed signs and builds sentences.

    Usage:
        sb = SentenceBuilder(timeout=3.0)
        sb.add_sign("i", confidence=0.93)
        if sb.update():
            sentence = sb.get_sentence()
            sb.reset()
    """

    def __init__(
        self,
        timeout: float = 3.0,
        max_words: int = 10,
        min_confidence: float = 0.55,
        min_repeat_gap: float = 0.8,
    ):
        self.timeout = timeout
        self.max_words = max_words
        self.min_confidence = min_confidence
        self.min_repeat_gap = min_repeat_gap

        self.words = []
        self.last_sign_time = None
        self.sentence = ""
        self.sentence_ready = False

        # anti-jitter memory
        self.last_added_sign = None
        self.last_added_at = 0.0

    def reset(self):
        self.words = []
        self.last_sign_time = None
        self.sentence = ""
        self.sentence_ready = False
        self.last_added_sign = None
        self.last_added_at = 0.0

    def add_sign(self, sign: str, confidence: float = 1.0):
        sign = normalize_sign(sign)
        if not sign:
            return
        if sign not in ALLOWED_SIGNS:
            return
        if confidence < self.min_confidence:
            return

        now = time.time()

        # debounce repeated same sign
        if sign == self.last_added_sign and (now - self.last_added_at) < self.min_repeat_gap:
            self.last_sign_time = now
            return

        # block consecutive duplicate
        if self.words and self.words[-1] == sign:
            self.last_sign_time = now
            return

        self.words.append(sign)
        self.last_added_sign = sign
        self.last_added_at = now
        self.last_sign_time = now
        self.sentence_ready = False

        # force generate on boundaries
        if len(self.words) >= self.max_words or sign == "stop":
            self._generate()

    def update(self) -> bool:
        """Call every frame. Returns True when a sentence is ready."""
        if (
            self.last_sign_time is not None
            and not self.sentence_ready
            and len(self.words) > 0
            and time.time() - self.last_sign_time >= self.timeout
        ):
            self._generate()
            return True
        return self.sentence_ready

    def _generate(self):
        self.sentence = correct_grammar(self.words)
        self.sentence_ready = True

    def get_sentence(self) -> str:
        return self.sentence

    def get_words(self) -> list:
        return list(self.words)

    def time_since_last_sign(self) -> float:
        if self.last_sign_time is None:
            return 0.0
        return time.time() - self.last_sign_time

    def countdown_remaining(self) -> float:
        if self.sentence_ready:
            return 0.0
        return max(0.0, self.timeout - self.time_since_last_sign())


if __name__ == "__main__":
    tests = [
        ["i", "go", "work"],
        ["i", "eat"],
        ["i", "want", "drink", "water"],
        ["i", "no", "understand"],
        ["you", "understand"],
        ["where", "you", "go"],
        ["what", "your", "name"],  # will normalize your->you
        ["please", "help"],
        ["hello", "how", "you"],
        ["no", "problem"],
    ]

    print("Local fallback grammar test:")
    print("=" * 60)
    for t in tests:
        result = _rule_based_grammar(t)
        print(f"{' '.join(t):<30} -> {result}")