import re

from markdown_it import MarkdownIt
from markdown_it.common.utils import escapeHtml


CALLOUT_LABELS = {
    "definition": "Définition",
    "exemple": "Exemple",
    "retenir": "À retenir",
    "attention": "Attention",
    "exercice": "Exercice",
    "tableau": "Tableau",
}
CALLOUT = re.compile(r"^\[!([a-z]+)\](?:[ \t]+(.+))?$", re.IGNORECASE)
INLINE_MARK = re.compile(r"\[\[(nombre|bleu|vert|violet|ambre|rouge):([^\[\]\n]+)\]\]", re.IGNORECASE)
NUMBER = re.compile(r"(?<![\w/])[-+−]?\d+(?:[ \u00a0\u202f]\d{3})*(?:[.,]\d+)?(?:[ \u00a0\u202f]?[%‰°])?(?![\w/])")


def inline_mark(state, silent):
    match = INLINE_MARK.match(state.src, state.pos, state.posMax)
    if not match or not (text := match[2].strip()):
        return False
    if not silent:
        opening = state.push("course_mark_open", "span", 1)
        opening.attrSet("class", f"course-mark course-mark-{match[1].lower()}")
        state.push("text", "", 0).content = text
        state.push("course_mark_close", "span", -1)
    state.pos = match.end()
    return True


def course_callouts(state):
    quotes = []
    tokens = state.tokens
    for index, token in enumerate(tokens):
        if token.type == "blockquote_close":
            token.tag = quotes.pop()
        if token.type != "blockquote_open":
            continue

        following = tokens[index + 1:index + 4]
        if [part.type for part in following] == ["paragraph_open", "inline", "paragraph_close"]:
            paragraph, inline, end = following
            first_line, _, body = inline.content.partition("\n")
            marker = CALLOUT.fullmatch(first_line.rstrip())
            if marker and (kind := marker[1].lower()) in CALLOUT_LABELS:
                token.tag = "div"
                token.attrSet("class", f"course-callout course-callout-{kind}")
                token.meta["label"] = CALLOUT_LABELS[kind]
                token.meta["title"] = (marker[2] or "").strip()
                inline.content = body.strip()
                if not inline.content:
                    paragraph.hidden = end.hidden = True
        quotes.append(token.tag)


def course_numbers(state):
    for block in state.tokens:
        if block.type != "inline" or not block.children:
            continue
        protected = 0
        for token in block.children:
            if token.type in {"link_open", "course_mark_open"}:
                protected += 1
            elif token.type in {"link_close", "course_mark_close"}:
                protected -= 1
            elif token.type == "text" and not protected:
                token.type = "course_text"


def render_course_text(renderer, tokens, index, options, env):
    return NUMBER.sub(r'<span class="course-mark course-mark-nombre">\g<0></span>', escapeHtml(tokens[index].content))


def render_course_quote(renderer, tokens, index, options, env):
    opening = renderer.renderToken(tokens, index, options, env)
    meta = tokens[index].meta
    if "label" not in meta:
        return opening
    label = escapeHtml(meta["label"])
    title = escapeHtml(meta["title"])
    label_html = f'<p class="course-callout-label">{label}</p>\n'
    title_html = f'<p class="course-callout-title">{title}</p>\n' if title else ""
    return opening + label_html + title_html


def render_course_table_open(renderer, tokens, index, options, env):
    wrapper = '<div class="course-table-scroll" role="region" aria-label="Tableau du cours" tabindex="0">\n'
    return wrapper + renderer.renderToken(tokens, index, options, env)


def render_course_table_close(renderer, tokens, index, options, env):
    return renderer.renderToken(tokens, index, options, env) + "</div>\n"


MARKDOWN = MarkdownIt("js-default", {"html": False})
MARKDOWN.inline.ruler.before("link", "course_mark", inline_mark)
MARKDOWN.core.ruler.before("inline", "course_callouts", course_callouts)
MARKDOWN.core.ruler.after("text_join", "course_numbers", course_numbers)
MARKDOWN.add_render_rule("course_text", render_course_text)
MARKDOWN.add_render_rule("blockquote_open", render_course_quote)
MARKDOWN.add_render_rule("table_open", render_course_table_open)
MARKDOWN.add_render_rule("table_close", render_course_table_close)


def render_course_markdown(markdown):
    return MARKDOWN.render(markdown)
