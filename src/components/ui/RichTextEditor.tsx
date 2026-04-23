"use client";

import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Table, TableRow, TableCell, TableHeader } from "@tiptap/extension-table";
import { Link } from "@tiptap/extension-link";
import { cn } from "@/lib/utils";

interface RichTextEditorProps {
  content: string; // TipTap JSON string or empty string
  onChange?: (json: string) => void;
  editable?: boolean;
  className?: string;
}

export default function RichTextEditor({
  content,
  onChange,
  editable = true,
  className,
}: RichTextEditorProps) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({ link: false }),
      Table.configure({ resizable: false }),
      TableRow,
      TableHeader,
      TableCell,
      Link.configure({ openOnClick: !editable, autolink: true }),
    ],
    content: content ? JSON.parse(content) : undefined,
    immediatelyRender: false,
    editable,
    onUpdate: ({ editor }) => {
      onChange?.(JSON.stringify(editor.getJSON()));
    },
    editorProps: {
      attributes: {
        class: cn(
          "rich-text w-full focus:outline-none text-sm",
          "[&_table]:border-collapse [&_table]:w-full",
          "[&_td]:border [&_td]:border-border [&_td]:px-2 [&_td]:py-1",
          "[&_th]:border [&_th]:border-border [&_th]:px-2 [&_th]:py-1 [&_th]:bg-muted [&_th]:font-semibold",
          editable && "min-h-[120px]"
        ),
      },
    },
  });

  return (
    <div className={cn("w-full", className)}>
      {editable && editor && <EditorToolbar editor={editor} />}
      <EditorContent editor={editor} />
    </div>
  );
}

function EditorToolbar({ editor }: { editor: ReturnType<typeof useEditor> }) {
  if (!editor) return null;

  return (
    <div className="flex flex-wrap gap-0.5 border-b pb-1.5 mb-2">
      <ToolbarButton
        onMouseDown={() => editor.chain().focus().toggleBold().run()}
        active={editor.isActive("bold")}
        title="Bold"
      >
        <strong>B</strong>
      </ToolbarButton>
      <ToolbarButton
        onMouseDown={() => editor.chain().focus().toggleItalic().run()}
        active={editor.isActive("italic")}
        title="Italic"
      >
        <em>I</em>
      </ToolbarButton>
      <ToolbarButton
        onMouseDown={() => editor.chain().focus().toggleBulletList().run()}
        active={editor.isActive("bulletList")}
        title="Bullet list"
      >
        •≡
      </ToolbarButton>
      <ToolbarButton
        onMouseDown={() => editor.chain().focus().toggleOrderedList().run()}
        active={editor.isActive("orderedList")}
        title="Numbered list"
      >
        1≡
      </ToolbarButton>
      <ToolbarButton
        onMouseDown={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
        active={editor.isActive("heading", { level: 3 })}
        title="Heading"
      >
        H
      </ToolbarButton>
      <ToolbarButton
        onMouseDown={() => editor.chain().focus().toggleCodeBlock().run()}
        active={editor.isActive("codeBlock")}
        title="Code block"
      >
        {"</>"}
      </ToolbarButton>
      <div className="w-px bg-border mx-0.5" />
      <ToolbarButton
        onMouseDown={() => {
          const url = window.prompt("URL:");
          if (url) editor.chain().focus().setLink({ href: url }).run();
        }}
        active={editor.isActive("link")}
        title="Link"
      >
        🔗
      </ToolbarButton>
      <ToolbarButton
        onMouseDown={() =>
          editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()
        }
        active={false}
        title="Insert table"
      >
        ⊞
      </ToolbarButton>
    </div>
  );
}

function ToolbarButton({
  onMouseDown,
  active,
  title,
  children,
}: {
  onMouseDown: () => void;
  active: boolean;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onMouseDown={(e) => {
        e.preventDefault(); // keep editor focused + selection intact
        onMouseDown();
      }}
      title={title}
      className={cn(
        "px-2 py-0.5 rounded text-xs font-mono transition-colors",
        active
          ? "bg-accent text-accent-foreground"
          : "hover:bg-accent hover:text-accent-foreground text-muted-foreground"
      )}
    >
      {children}
    </button>
  );
}
