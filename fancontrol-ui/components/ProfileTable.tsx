import React from 'react';
import {
    DndContext,
    closestCenter,
    KeyboardSensor,
    PointerSensor,
    useSensor,
    useSensors,
    DragEndEvent,
} from '@dnd-kit/core';
import {
    arrayMove,
    SortableContext,
    sortableKeyboardCoordinates,
    useSortable,
    verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { FanProfile, TempSource } from '../types';

interface ProfileTableProps {
    profiles: FanProfile[];
    type: 'system' | 'gpu';
    onChange: (profiles: FanProfile[]) => void;
    tempSources?: TempSource[];  // Which temp sources to show columns for
}

interface SortableRowProps {
    profile: FanProfile;
    index: number;
    type: 'system' | 'gpu';
    tempSources: TempSource[];
    onUpdate: (index: number, field: string, value: string | number | null) => void;
    onDelete: (index: number) => void;
    canDelete: boolean;
}

const SortableRow: React.FC<SortableRowProps> = ({
    profile,
    index,
    type,
    tempSources,
    onUpdate,
    onDelete,
    canDelete,
}) => {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging,
    } = useSortable({ id: `profile-${index}` });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
    };

    const handleThresholdChange = (field: string, value: string) => {
        const numValue = value === '' ? null : parseInt(value, 10);
        onUpdate(index, `thresholds.${field}`, isNaN(numValue as number) ? null : numValue);
    };

    return (
        <div
            ref={setNodeRef}
            style={style}
            className={`flex items-center gap-2 p-2 rounded-lg border ${isDragging ? 'bg-slate-700 border-slate-600' : 'bg-slate-800/50 border-slate-700 hover:bg-slate-800'
                }`}
        >
            {/* Drag Handle */}
            <button
                {...attributes}
                {...listeners}
                className="cursor-grab active:cursor-grabbing text-slate-500 hover:text-slate-300 p-1 flex-shrink-0"
                title="Перетащите для сортировки"
            >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                    <circle cx="9" cy="6" r="2" />
                    <circle cx="15" cy="6" r="2" />
                    <circle cx="9" cy="12" r="2" />
                    <circle cx="15" cy="12" r="2" />
                    <circle cx="9" cy="18" r="2" />
                    <circle cx="15" cy="18" r="2" />
                </svg>
            </button>

            {/* Profile Name */}
            <div className="flex-1 min-w-0">
                <input
                    type="text"
                    value={profile.name}
                    onChange={(e) => onUpdate(index, 'name', e.target.value)}
                    className="w-full bg-slate-700 border border-slate-600 rounded px-2 py-1 text-sm text-slate-200 focus:border-cyan-500 focus:outline-none"
                    placeholder="Название"
                />
            </div>

            {/* Target */}
            <div className="flex items-center gap-1 flex-shrink-0">
                <input
                    type="number"
                    value={profile.target}
                    onChange={(e) => onUpdate(index, 'target', parseInt(e.target.value) || 0)}
                    className="w-16 bg-slate-700 border border-slate-600 rounded px-2 py-1 text-sm text-slate-200 focus:border-cyan-500 focus:outline-none"
                    min={0}
                />
                <span className="text-slate-500 text-xs">
                    {type === 'system' ? 'RPM' : '%'}
                </span>
            </div>

            {/* Thresholds - show based on tempSources */}
            {tempSources.map(source => (
                <div key={source} className="flex items-center gap-1 flex-shrink-0">
                    <span className="text-slate-500 text-xs w-8 text-right overflow-hidden text-ellipsis whitespace-nowrap" title={source}>
                        {source.toUpperCase().slice(0, 3)}:
                    </span>
                    <input
                        type="number"
                        value={profile.thresholds[source] ?? ''}
                        onChange={(e) => handleThresholdChange(source, e.target.value)}
                        className="w-12 bg-slate-700 border border-slate-600 rounded px-1 py-1 text-sm text-slate-200 focus:border-cyan-500 focus:outline-none"
                        placeholder="—"
                    />
                </div>
            ))}

            {/* Delete Button */}
            <button
                onClick={() => onDelete(index)}
                disabled={!canDelete}
                className={`p-1 rounded transition-colors flex-shrink-0 ${canDelete
                    ? 'text-red-400 hover:text-red-300 hover:bg-red-900/30'
                    : 'text-slate-600 cursor-not-allowed'
                    }`}
                title={canDelete ? 'Удалить режим' : 'Нельзя удалить единственный режим'}
            >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
                </svg>
            </button>
        </div>
    );
};

export const ProfileTable: React.FC<ProfileTableProps> = ({ profiles, type, onChange, tempSources = ['cpu', 'gpu', 'hdd'] }) => {
    // Guard against undefined/null profiles
    const safeProfiles = profiles || [];

    const sensors = useSensors(
        useSensor(PointerSensor),
        useSensor(KeyboardSensor, {
            coordinateGetter: sortableKeyboardCoordinates,
        })
    );

    const handleDragEnd = (event: DragEndEvent) => {
        const { active, over } = event;

        if (over && active.id !== over.id) {
            const oldIndex = parseInt(String(active.id).replace('profile-', ''), 10);
            const newIndex = parseInt(String(over.id).replace('profile-', ''), 10);
            onChange(arrayMove(safeProfiles, oldIndex, newIndex));
        }
    };

    const handleUpdate = (index: number, field: string, value: string | number | null) => {
        const newProfiles = [...safeProfiles];
        const profile = { ...newProfiles[index] };

        if (field.startsWith('thresholds.')) {
            const thresholdField = field.replace('thresholds.', '');
            profile.thresholds = { ...profile.thresholds, [thresholdField]: value };
        } else if (field === 'name') {
            profile.name = value as string;
        } else if (field === 'target') {
            profile.target = value as number;
        }

        newProfiles[index] = profile;
        onChange(newProfiles);
    };

    const handleDelete = (index: number) => {
        if (safeProfiles.length <= 1) return;
        const newProfiles = safeProfiles.filter((_, i) => i !== index);
        onChange(newProfiles);
    };

    const handleAdd = () => {
        const lastProfile = safeProfiles[safeProfiles.length - 1];
        const newProfile: FanProfile = {
            name: `Режим ${safeProfiles.length + 1}`,
            target: type === 'system' ? (lastProfile?.target || 1200) + 200 : Math.min((lastProfile?.target || 50) + 10, 100),
            thresholds: {},
        };
        onChange([...safeProfiles, newProfile]);
    };

    return (
        <div className="space-y-3">
            {/* Header */}
            <div className="hidden md:flex items-center gap-2 px-2 text-slate-400 text-xs uppercase tracking-wider">
                <div className="w-8"></div>
                <div className="flex-1">Название</div>
                <div className="w-20">Цель</div>
                {tempSources.map(source => (
                    <div key={source} className="w-16 text-center" title={source}>
                        {source.toUpperCase().slice(0, 3)} &gt;
                    </div>
                ))}
                <div className="w-8"></div>
            </div>

            {/* Rows */}
            <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleDragEnd}
            >
                <SortableContext
                    items={safeProfiles.map((_, i) => `profile-${i}`)}
                    strategy={verticalListSortingStrategy}
                >
                    <div className="space-y-2">
                        {safeProfiles.map((profile, index) => (
                            <SortableRow
                                key={`profile-${index}`}
                                profile={profile}
                                index={index}
                                type={type}
                                tempSources={tempSources}
                                onUpdate={handleUpdate}
                                onDelete={handleDelete}
                                canDelete={safeProfiles.length > 1}
                            />
                        ))}
                    </div>
                </SortableContext>
            </DndContext>

            <button
                onClick={handleAdd}
                className="w-full py-2 border-2 border-dashed border-slate-600 rounded-lg text-slate-400 hover:border-slate-500 hover:text-slate-300 hover:bg-slate-800/30 transition-colors flex items-center justify-center gap-2"
            >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M12 5v14M5 12h14" />
                </svg>
                Добавить режим
            </button>

            <p className="text-slate-500 text-xs">
                {type === 'system'
                    ? 'Режим активируется когда любой из датчиков превышает указанный порог'
                    : 'Режим 0 (Авто) = управление драйвером. Остальные режимы по порогу GPU'}
            </p>
        </div>
    );
};
