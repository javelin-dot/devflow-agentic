import { forwardRef, useImperativeHandle, useMemo } from 'react';

import { DocumentEditor } from './DocumentEditor';

import { SpecGenerateStreamPanel } from './SpecGenerateStreamPanel';

import { useDocuments } from '../api/hooks';

import { useSpecGenerate } from '../hooks/useSpecGenerate';



export interface RequirementSpecEditorRef {

  generate: () => void;

  cancel: () => void;

}



interface RequirementSpecEditorProps {

  reqId: string;

  readonly?: boolean;

  previewVersion?: number | null;

  onPreviewVersionChange?: (v: number | null) => void;

  onGeneratingChange?: (generating: boolean) => void;

}



export const RequirementSpecEditor = forwardRef<RequirementSpecEditorRef, RequirementSpecEditorProps>((props, ref) => {

  const { reqId, readonly, previewVersion, onPreviewVersionChange, onGeneratingChange } = props;

  const { data: documents = [] } = useDocuments({ reqId, type: 'requirement_spec' });

  const body = useMemo(() => ({ reqId }), [reqId]);



  const { generating, stream, genLog, generate, cancel } = useSpecGenerate({

    endpoint: '/api/specs/requirement/generate',

    body,

    reqId,

    documentType: 'requirement_spec',

    onGeneratingChange,

  });



  const doc = documents[0];



  useImperativeHandle(ref, () => ({ generate, cancel }));



  if (generating || (!doc && (stream.thinking || stream.assistant))) {

    return (

      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>

        <SpecGenerateStreamPanel generating={generating} stream={stream} genLog={genLog} onCancel={cancel} />

      </div>

    );

  }



  if (!doc) {

    return (

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12 }}>

        <div style={{ color: 'var(--text-tertiary)', fontSize: 14 }}>暂无需求 Spec</div>

        {genLog && (

          <div style={{ fontSize: 12, color: genLog.startsWith('生成失败') ? 'var(--accent-red)' : 'var(--text-secondary)' }}>

            {genLog}

          </div>

        )}

      </div>

    );

  }



  return (

    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>

      <div style={{ flex: 1, overflow: 'hidden' }}>

        <DocumentEditor docId={doc.id} previewVersion={previewVersion} onPreviewVersionChange={onPreviewVersionChange} />

      </div>

      {genLog && (

        <div style={{

          padding: '6px 12px', fontSize: 12, flexShrink: 0, borderTop: '1px solid var(--border-default)',

          color: genLog.startsWith('生成失败') ? 'var(--accent-red)' : 'var(--accent-green)',

        }}>

          {genLog}

        </div>

      )}

    </div>

  );

});


