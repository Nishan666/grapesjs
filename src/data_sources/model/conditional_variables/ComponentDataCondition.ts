import {
  ComponentAddType,
  ComponentDefinitionDefined,
  ComponentOptions,
  ComponentProperties,
  ToHTMLOptions,
} from '../../../dom_components/model/types';
import { toLowerCase } from '../../../utils/mixins';
import { DataCondition, DataConditionProps, DataConditionType } from './DataCondition';
import { ConditionProps } from './DataConditionEvaluator';
import { StringOperation } from './operators/StringOperator';
import { DataConditionIfTrueType, DataConditionIfFalseType } from './constants';
import { ComponentWithDataResolver } from '../ComponentWithDataResolver';
import Component from '../../../dom_components/model/Component';
import { DataResolver } from '../../types';
import { DataCollectionStateMap } from '../data_collection/types';

export type DataConditionDisplayType = typeof DataConditionIfTrueType | typeof DataConditionIfFalseType;

export interface ComponentDataConditionProps extends ComponentProperties {
  type: typeof DataConditionType;
  dataResolver: DataConditionProps;
}

export default class ComponentDataCondition extends ComponentWithDataResolver<DataConditionProps> {
  get defaults(): ComponentDefinitionDefined {
    return {
      // @ts-ignore
      ...super.defaults,
      droppable: false,
      type: DataConditionType,
      dataResolver: {
        condition: {
          left: '',
          operator: StringOperation.equalsIgnoreCase,
          right: '',
        },
      },
      components: [
        {
          type: DataConditionIfTrueType,
        },
        {
          type: DataConditionIfFalseType,
        },
      ],
    };
  }

  isTrue() {
    return this.dataResolver.isTrue();
  }

  getCondition() {
    return this.dataResolver.getCondition();
  }

  getIfTrueContent(): Component | undefined {
    return this.components().at(0);
  }

  getIfFalseContent(): Component | undefined {
    return this.components().at(1);
  }

  getOutputContent(): Component | undefined {
    return this.isTrue() ? this.getIfTrueContent() : this.getIfFalseContent();
  }

  setCondition(newCondition: ConditionProps) {
    this.dataResolver.setCondition(newCondition);
  }

  setIfTrueComponents(content: ComponentAddType) {
    this.setComponentsAtIndex(0, content);
  }

  setIfFalseComponents(content: ComponentAddType) {
    this.setComponentsAtIndex(1, content);
  }

  getInnerHTML(opts?: ToHTMLOptions): string {
    return this.getOutputContent()?.getInnerHTML(opts) ?? '';
  }

  protected createResolverInstance(
    props: DataConditionProps,
    options: ComponentOptions & { collectionsStateMap: DataCollectionStateMap },
  ): DataResolver {
    return new DataCondition(props, options);
  }

  private setComponentsAtIndex(index: number, newContent: ComponentAddType) {
    const component = this.components().at(index);
    component?.components(newContent);
  }

  static isComponent(el: HTMLElement) {
    return toLowerCase(el.tagName) === DataConditionType;
  }
}
